from __future__ import annotations

import os
import secrets
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

app = FastAPI(title="dispatcherone-server")

ACTIVE_TOKENS: set[str] = set()

# tracking_token -> {call_id, status, status_updated_at, pickup_city, eta_minutes}
TRACKING_LINKS: dict[str, dict] = {}
# call_id -> tracking_token  (for rotation / lookup)
CALL_TRACKING_MAP: dict[str, str] = {}

def require_token(x_auth_token: Optional[str]) -> str:
    if not x_auth_token or x_auth_token not in ACTIVE_TOKENS:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_auth_token

@app.get("/health")
def health():
    return {"status": "ok"}

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
# Tracking-link models
# ---------------------------------------------------------------------------

class TrackingLinkCreate(BaseModel):
    status: str
    status_updated_at: str
    pickup_city: Optional[str] = None
    eta_minutes: Optional[int] = None

class TrackingStatusUpdate(BaseModel):
    status: str
    status_updated_at: str
    pickup_city: Optional[str] = None
    eta_minutes: Optional[int] = None

# ---------------------------------------------------------------------------
# POST /calls/{call_id}/tracking-link  (authenticated)
# ---------------------------------------------------------------------------

@app.post("/calls/{call_id}/tracking-link")
def create_tracking_link(
    call_id: str,
    payload: TrackingLinkCreate,
    request: Request,
    x_auth_token: Optional[str] = Header(default=None),
):
    require_token(x_auth_token)

    # If a link already exists for this call, rotate it
    old_token = CALL_TRACKING_MAP.get(call_id)
    if old_token:
        TRACKING_LINKS.pop(old_token, None)

    tracking_token = secrets.token_urlsafe(32)

    TRACKING_LINKS[tracking_token] = {
        "call_id": call_id,
        "status": payload.status,
        "status_updated_at": payload.status_updated_at,
        "pickup_city": payload.pickup_city,
        "eta_minutes": payload.eta_minutes,
    }
    CALL_TRACKING_MAP[call_id] = tracking_token

    base_url = str(request.base_url).rstrip("/")
    tracking_url = f"{base_url}/public/track/{tracking_token}"

    return {"token": tracking_token, "url": tracking_url}

# ---------------------------------------------------------------------------
# PUT /calls/{call_id}/tracking-status  (authenticated – update status/ETA)
# ---------------------------------------------------------------------------

@app.put("/calls/{call_id}/tracking-status")
def update_tracking_status(
    call_id: str,
    payload: TrackingStatusUpdate,
    x_auth_token: Optional[str] = Header(default=None),
):
    require_token(x_auth_token)

    tracking_token = CALL_TRACKING_MAP.get(call_id)
    if not tracking_token or tracking_token not in TRACKING_LINKS:
        raise HTTPException(status_code=404, detail="No tracking link for this call")

    entry = TRACKING_LINKS[tracking_token]
    entry["status"] = payload.status
    entry["status_updated_at"] = payload.status_updated_at
    if payload.pickup_city is not None:
        entry["pickup_city"] = payload.pickup_city
    if payload.eta_minutes is not None:
        entry["eta_minutes"] = payload.eta_minutes

    return {"ok": True}

# ---------------------------------------------------------------------------
# GET /public/track/{token}  (public – HTML page, no auth required)
# ---------------------------------------------------------------------------

TRACKING_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Track Your Service Call</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       background:#f4f6f8;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:440px;width:100%;padding:32px;text-align:center}
  h1{font-size:1.25rem;margin-bottom:8px}
  .subtitle{color:#64748b;font-size:.875rem;margin-bottom:24px}
  .status-badge{display:inline-block;padding:6px 16px;border-radius:20px;font-weight:600;font-size:.95rem;
                background:#e0f2fe;color:#0369a1;margin-bottom:20px}
  .status-badge.closed{background:#dcfce7;color:#15803d}
  .info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:.9rem}
  .info-row:last-child{border-bottom:none}
  .label{color:#64748b}
  .value{font-weight:500}
  .eta-highlight{font-size:1.5rem;font-weight:700;color:#0369a1;margin:12px 0}
  .refresh-note{margin-top:20px;font-size:.75rem;color:#94a3b8}
  .error-msg{color:#dc2626;font-size:.95rem;margin-top:12px}
</style>
</head>
<body>
<div class="card">
  <h1>&#128666; Service Call Tracking</h1>
  <p class="subtitle">Real-time status for your tow / roadside service</p>
  <div id="content"><p>Loading&hellip;</p></div>
  <p class="refresh-note">Refresh the page for the latest status.</p>
</div>
<script>
(function(){
  var token = location.pathname.split("/").pop();
  fetch("/public/track/" + encodeURIComponent(token) + "/json")
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d){
      var closed = ["98","95","97"].indexOf(d.status) !== -1;
      var statusClass = closed ? "status-badge closed" : "status-badge";
      var html = '<div class="' + statusClass + '">' + esc(d.status_label) + '</div>';
      if(d.eta_minutes != null && !closed){
        html += '<div class="eta-highlight">ETA: ~' + d.eta_minutes + ' min</div>';
      }
      html += '<div class="info-row"><span class="label">City</span><span class="value">' + esc(d.pickup_city || "—") + '</span></div>';
      html += '<div class="info-row"><span class="label">Last Updated</span><span class="value">' + esc(d.status_updated_at || "—") + '</span></div>';
      document.getElementById("content").innerHTML = html;
    })
    .catch(function(){
      document.getElementById("content").innerHTML = '<p class="error-msg">Tracking link not found or expired.</p>';
    });

  function esc(s){ var d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
})();
</script>
</body>
</html>"""

_STATUS_LABELS: dict[str, str] = {
    "ACTIVE": "Active",
    "PENDING": "Pending",
    "ASSIGNED": "Driver Assigned",
    "EN_ROUTE": "Driver En Route",
    "94": "Driver Arrived",
    "95": "Completed",
    "97": "Cancelled",
    "IN_TOW": "In Tow",
    "98": "Closed",
}

@app.get("/public/track/{token}", response_class=HTMLResponse)
def public_tracking_page(token: str):
    if token not in TRACKING_LINKS:
        return HTMLResponse(
            content=TRACKING_PAGE_HTML,
            status_code=200,
        )
    return HTMLResponse(content=TRACKING_PAGE_HTML)

@app.get("/public/track/{token}/json")
def public_tracking_json(token: str):
    entry = TRACKING_LINKS.get(token)
    if not entry:
        raise HTTPException(status_code=404, detail="Tracking link not found")

    return {
        "status": entry["status"],
        "status_label": _STATUS_LABELS.get(entry["status"], entry["status"]),
        "status_updated_at": entry["status_updated_at"],
        "pickup_city": entry.get("pickup_city"),
        "eta_minutes": entry.get("eta_minutes"),
    }
