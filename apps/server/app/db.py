"""Database connection and table initialization for the DispatcherOne server."""

from __future__ import annotations

import os

import psycopg
from psycopg.rows import dict_row


def get_dsn() -> str:
    user = os.getenv("POSTGRES_USER", "dispatcherone")
    password = os.getenv("POSTGRES_PASSWORD", "dispatcherone_dev_pw")
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    dbname = os.getenv("POSTGRES_DB", "dispatcherone")
    return f"postgresql://{user}:{password}@{host}:{port}/{dbname}"


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_dsn(), row_factory=dict_row)


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS drivers (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    pw_hash     TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    external_call_number TEXT,
    pickup_address  TEXT NOT NULL,
    dropoff_address TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_driver_id TEXT REFERENCES drivers(id),
    vehicle_description TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_driver ON jobs(assigned_driver_id);
"""


def ensure_schema() -> None:
    """Create tables if they do not already exist."""
    with get_connection() as conn:
        conn.execute(_SCHEMA_SQL)
        conn.commit()
