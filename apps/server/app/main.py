from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import hashlib
import hmac
from pydantic import BaseModel

from app.models import (
    DriverLoginRequest,
    DriverLoginResponse,
    DriverMeResponse,
    JobOut,
    StatusUpdateRequest,
    StatusUpdateResponse,
)

logger = logging.getLogger("dispatcherone")

app = FastAPI(title="dispatcherone-server")

# ---------------------------------------------------------------------------
# CORS – allow the driver PWA (served from any origin during dev)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Canonical call/job statuses (same as the Tauri desktop app)
# ---------------------------------------------------------------------------
VALID_STATUSES = frozenset(
    ["PENDING", "ASSIGNED", "ACTIVE", "EN_ROUTE", "94", "95", "97", "IN_TOW", "98"]
)
STATUS_COMPLETED = "98"

# ---------------------------------------------------------------------------
# Admin auth (unchanged)
# ---------------------------------------------------------------------------
ACTIVE_TOKENS: set[str] = set()


def require_token(x_auth_token: Optional[str]) -> str:
    if not x_auth_token or x_auth_token not in ACTIVE_TOKENS:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_auth_token


# ---------------------------------------------------------------------------
# Driver auth – token → driver_id map
# ---------------------------------------------------------------------------
DRIVER_TOKENS: dict[str, str] = {}  # token → driver_id


def _hash_password(password: str) -> str:
    """PBKDF2-based password hash (standard library, no extra dependency)."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations=260_000)
    return f"{salt.hex()}${dk.hex()}"


def _verify_password(password: str, pw_hash: str) -> bool:
    parts = pw_hash.split("$", 1)
    if len(parts) != 2:
        return False
    salt_hex, stored_dk_hex = parts
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations=260_000)
    return hmac.compare_digest(dk.hex(), stored_dk_hex)


def require_driver_token(x_auth_token: Optional[str] = Header(default=None)) -> str:
    """Return the driver_id for a valid driver token, or 401."""
    if not x_auth_token or x_auth_token not in DRIVER_TOKENS:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return DRIVER_TOKENS[x_auth_token]


# ---------------------------------------------------------------------------
# DB helpers (lazy import to allow running without Postgres in tests)
# ---------------------------------------------------------------------------
def _db():
    from app.db import get_connection
    try:
        return get_connection()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


# ---------------------------------------------------------------------------
# Startup – create tables if Postgres is reachable
# ---------------------------------------------------------------------------
@app.on_event("startup")
def on_startup():
    try:
        from app.db import ensure_schema
        ensure_schema()
        logger.info("Database schema ensured")
    except Exception as exc:
        logger.warning("Could not connect to database – driver features disabled: %s", exc)


# ---------------------------------------------------------------------------
# WebSocket connections for drivers
# ---------------------------------------------------------------------------
class _WSManager:
    """Track active driver WebSocket connections."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, driver_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(driver_id, []).append(ws)

    def disconnect(self, driver_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(driver_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, driver_id: str, message: dict) -> None:
        for ws in list(self._connections.get(driver_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(driver_id, ws)

    async def broadcast_all(self, message: dict) -> None:
        for driver_id in list(self._connections):
            await self.broadcast(driver_id, message)


ws_manager = _WSManager()

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# Admin login (unchanged)
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    password: str


@app.post("/login")
def login(payload: LoginRequest):
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password:
        raise HTTPException(status_code=500, detail="ADMIN_PASSWORD is not set on the server")

    if payload.password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid password")

    token = secrets.token_urlsafe(32)
    ACTIVE_TOKENS.add(token)
    return {"token": token}


@app.get("/me")
def me(x_auth_token: Optional[str] = Header(default=None)):
    require_token(x_auth_token)
    return {"role": "admin"}


# ---------------------------------------------------------------------------
# Driver login
# ---------------------------------------------------------------------------

@app.post("/driver/login", response_model=DriverLoginResponse)
def driver_login(payload: DriverLoginRequest):
    with _db() as conn:
        row = conn.execute(
            "SELECT id, pw_hash, display_name FROM drivers WHERE email = %s",
            [payload.email],
        ).fetchone()

    if not row or not _verify_password(payload.password, row["pw_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = secrets.token_urlsafe(32)
    DRIVER_TOKENS[token] = row["id"]
    return DriverLoginResponse(
        token=token,
        driver_id=row["id"],
        display_name=row["display_name"],
    )


@app.get("/driver/me", response_model=DriverMeResponse)
def driver_me(driver_id: str = Depends(require_driver_token)):
    with _db() as conn:
        row = conn.execute(
            "SELECT id, email, display_name FROM drivers WHERE id = %s",
            [driver_id],
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Driver not found")
    return DriverMeResponse(driver_id=row["id"], email=row["email"], display_name=row["display_name"])


# ---------------------------------------------------------------------------
# Driver jobs
# ---------------------------------------------------------------------------

@app.get("/driver/jobs", response_model=list[JobOut])
def driver_jobs(driver_id: str = Depends(require_driver_token)):
    with _db() as conn:
        rows = conn.execute(
            """SELECT id, external_call_number, pickup_address, dropoff_address,
                      status, status_updated_at::text, vehicle_description, notes,
                      created_at::text, updated_at::text
               FROM jobs
               WHERE assigned_driver_id = %s AND status != %s
               ORDER BY created_at DESC""",
            [driver_id, STATUS_COMPLETED],
        ).fetchall()
    return [JobOut(**r) for r in rows]


@app.patch("/driver/jobs/{job_id}/status", response_model=StatusUpdateResponse)
async def driver_update_job_status(
    job_id: str,
    payload: StatusUpdateRequest,
    driver_id: str = Depends(require_driver_token),
):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {payload.status}")

    now = datetime.now(timezone.utc).isoformat()
    with _db() as conn:
        row = conn.execute(
            "SELECT id FROM jobs WHERE id = %s AND assigned_driver_id = %s",
            [job_id, driver_id],
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found or not assigned to you")

        conn.execute(
            """UPDATE jobs
               SET status = %s, status_updated_at = %s, updated_at = %s
               WHERE id = %s""",
            [payload.status, now, now, job_id],
        )
        conn.commit()

    result = StatusUpdateResponse(id=job_id, status=payload.status, status_updated_at=now)

    # Broadcast status change via WebSocket
    await ws_manager.broadcast(driver_id, {
        "type": "STATUS_UPDATED",
        "job_id": job_id,
        "status": payload.status,
        "status_updated_at": now,
    })

    return result


# ---------------------------------------------------------------------------
# WebSocket for driver real-time updates
# ---------------------------------------------------------------------------

@app.websocket("/driver/ws")
async def driver_ws(ws: WebSocket, token: str = ""):
    if token not in DRIVER_TOKENS:
        await ws.close(code=4001, reason="Unauthorized")
        return

    driver_id = DRIVER_TOKENS[token]
    await ws_manager.connect(driver_id, ws)
    try:
        while True:
            # Keep connection alive; client can send pings
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(driver_id, ws)


# ---------------------------------------------------------------------------
# Seed helper – POST /driver/seed (creates a demo driver + jobs for testing)
# Only available when ADMIN_PASSWORD env var matches the token.
# ---------------------------------------------------------------------------

@app.post("/driver/seed")
def driver_seed(x_auth_token: Optional[str] = Header(default=None)):
    require_token(x_auth_token)

    driver_id = str(uuid.uuid4())
    pw_hash = _hash_password("driver123")
    now = datetime.now(timezone.utc).isoformat()

    with _db() as conn:
        # Check if demo driver already exists
        existing = conn.execute(
            "SELECT id FROM drivers WHERE email = %s", ["driver@example.com"]
        ).fetchone()
        if existing:
            driver_id = existing["id"]
        else:
            conn.execute(
                "INSERT INTO drivers (id, email, pw_hash, display_name) VALUES (%s, %s, %s, %s)",
                [driver_id, "driver@example.com", pw_hash, "Demo Driver"],
            )

        # Add sample jobs
        for i, (status, pickup, dropoff) in enumerate([
            ("ASSIGNED", "123 Main St, Springfield", "456 Oak Ave, Shelbyville"),
            ("EN_ROUTE", "789 Elm St, Capital City", "321 Pine Rd, Ogdenville"),
            ("ACTIVE", "555 Maple Dr, North Haverbrook", None),
        ]):
            job_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO jobs (id, external_call_number, pickup_address,
                   dropoff_address, status, assigned_driver_id, vehicle_description, notes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    job_id,
                    f"CALL-{1000 + i}",
                    pickup,
                    dropoff,
                    status,
                    driver_id,
                    f"2024 Vehicle Model {i + 1}",
                    f"Sample job {i + 1}",
                ],
            )
        conn.commit()

    return {
        "driver_id": driver_id,
        "email": "driver@example.com",
        "password": "driver123",
        "jobs_created": 3,
    }
