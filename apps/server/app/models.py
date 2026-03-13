"""Pydantic models for driver PWA endpoints."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr


class DriverLoginRequest(BaseModel):
    email: EmailStr
    password: str


class DriverLoginResponse(BaseModel):
    token: str
    driver_id: str
    display_name: str


class DriverMeResponse(BaseModel):
    driver_id: str
    email: str
    display_name: str
    role: str = "driver"


class JobOut(BaseModel):
    id: str
    external_call_number: Optional[str] = None
    pickup_address: str
    dropoff_address: Optional[str] = None
    status: str
    status_updated_at: str
    vehicle_description: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


class StatusUpdateRequest(BaseModel):
    status: str


class StatusUpdateResponse(BaseModel):
    id: str
    status: str
    status_updated_at: str
