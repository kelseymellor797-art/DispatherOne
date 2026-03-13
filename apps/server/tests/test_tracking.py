"""Tests for the tracking-link endpoints."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ADMIN_PASSWORD", "test-password")

from app.main import app, ACTIVE_TOKENS, TRACKING_LINKS, CALL_TRACKING_MAP  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_state():
    """Clear in-memory state between tests."""
    ACTIVE_TOKENS.clear()
    TRACKING_LINKS.clear()
    CALL_TRACKING_MAP.clear()
    yield
    ACTIVE_TOKENS.clear()
    TRACKING_LINKS.clear()
    CALL_TRACKING_MAP.clear()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def auth_token(client: TestClient) -> str:
    resp = client.post("/login", json={"password": "test-password"})
    assert resp.status_code == 200
    return resp.json()["token"]


# ── POST /calls/{call_id}/tracking-link ──────────────────────────────────


class TestCreateTrackingLink:
    def test_requires_auth(self, client: TestClient):
        resp = client.post(
            "/calls/call-1/tracking-link",
            json={"status": "ACTIVE", "status_updated_at": "2025-01-01T00:00:00Z"},
        )
        assert resp.status_code == 401

    def test_creates_link(self, client: TestClient, auth_token: str):
        resp = client.post(
            "/calls/call-1/tracking-link",
            json={
                "status": "ASSIGNED",
                "status_updated_at": "2025-01-01T12:00:00Z",
                "pickup_city": "Springfield",
                "eta_minutes": 15,
            },
            headers={"x-auth-token": auth_token},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body
        assert "url" in body
        assert body["token"] in body["url"]

    def test_rotation_invalidates_old_token(self, client: TestClient, auth_token: str):
        headers = {"x-auth-token": auth_token}
        payload = {"status": "ACTIVE", "status_updated_at": "2025-01-01T00:00:00Z"}

        resp1 = client.post("/calls/call-1/tracking-link", json=payload, headers=headers)
        old_token = resp1.json()["token"]

        resp2 = client.post("/calls/call-1/tracking-link", json=payload, headers=headers)
        new_token = resp2.json()["token"]

        assert old_token != new_token
        # Old token should no longer resolve
        assert client.get(f"/public/track/{old_token}/json").status_code == 404
        # New token should work
        assert client.get(f"/public/track/{new_token}/json").status_code == 200


# ── PUT /calls/{call_id}/tracking-status ─────────────────────────────────


class TestUpdateTrackingStatus:
    def test_requires_auth(self, client: TestClient):
        resp = client.put(
            "/calls/call-1/tracking-status",
            json={"status": "EN_ROUTE", "status_updated_at": "2025-01-01T01:00:00Z"},
        )
        assert resp.status_code == 401

    def test_404_when_no_link(self, client: TestClient, auth_token: str):
        resp = client.put(
            "/calls/call-1/tracking-status",
            json={"status": "EN_ROUTE", "status_updated_at": "2025-01-01T01:00:00Z"},
            headers={"x-auth-token": auth_token},
        )
        assert resp.status_code == 404

    def test_updates_status(self, client: TestClient, auth_token: str):
        headers = {"x-auth-token": auth_token}
        create_payload = {"status": "ACTIVE", "status_updated_at": "2025-01-01T00:00:00Z"}
        resp = client.post("/calls/call-1/tracking-link", json=create_payload, headers=headers)
        token = resp.json()["token"]

        update_resp = client.put(
            "/calls/call-1/tracking-status",
            json={
                "status": "EN_ROUTE",
                "status_updated_at": "2025-01-01T01:00:00Z",
                "eta_minutes": 10,
            },
            headers=headers,
        )
        assert update_resp.status_code == 200

        json_resp = client.get(f"/public/track/{token}/json")
        data = json_resp.json()
        assert data["status"] == "EN_ROUTE"
        assert data["eta_minutes"] == 10


# ── GET /public/track/{token} ────────────────────────────────────────────


class TestPublicTrackingPage:
    def test_html_page_returned(self, client: TestClient, auth_token: str):
        headers = {"x-auth-token": auth_token}
        resp = client.post(
            "/calls/call-1/tracking-link",
            json={"status": "ACTIVE", "status_updated_at": "2025-01-01T00:00:00Z"},
            headers=headers,
        )
        token = resp.json()["token"]

        page_resp = client.get(f"/public/track/{token}")
        assert page_resp.status_code == 200
        assert "text/html" in page_resp.headers["content-type"]
        assert "Service Call Tracking" in page_resp.text

    def test_html_page_for_invalid_token(self, client: TestClient):
        page_resp = client.get("/public/track/does-not-exist")
        assert page_resp.status_code == 200
        assert "text/html" in page_resp.headers["content-type"]


# ── GET /public/track/{token}/json ───────────────────────────────────────


class TestPublicTrackingJson:
    def test_returns_sanitized_data(self, client: TestClient, auth_token: str):
        headers = {"x-auth-token": auth_token}
        client.post(
            "/calls/call-1/tracking-link",
            json={
                "status": "EN_ROUTE",
                "status_updated_at": "2025-01-01T12:00:00Z",
                "pickup_city": "Portland",
                "eta_minutes": 20,
            },
            headers=headers,
        )
        token = CALL_TRACKING_MAP["call-1"]

        resp = client.get(f"/public/track/{token}/json")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "EN_ROUTE"
        assert data["status_label"] == "Driver En Route"
        assert data["pickup_city"] == "Portland"
        assert data["eta_minutes"] == 20
        # Ensure no PII / internal data is leaked
        assert "call_id" not in data

    def test_404_for_invalid_token(self, client: TestClient):
        resp = client.get("/public/track/nonexistent/json")
        assert resp.status_code == 404
