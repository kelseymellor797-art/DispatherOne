from __future__ import annotations

import os
import secrets
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="dispatcherone-server")

ACTIVE_TOKENS: set[str] = set()

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
