"""Tests for the registration whitelist (/allowed-emails, admin-only) and
its enforcement on POST /users.

Deliberately does NOT use the `open_registration` fixture (see its
docstring in conftest.py) — this file is exactly the one place meant to
exercise the real, un-bypassed gate.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert

from app.core.security import create_access_token
from app.main import app
from app.models.user_storage import users_table

pytestmark = pytest.mark.usefixtures("sql_engine")


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_user(role: str, user_id: int) -> str:
    """Insert a user row directly (bypassing registration entirely, so
    this never depends on the whitelist) and return a valid JWT for it —
    same pattern as test_route_protection.py's `_token()`."""
    from app.services.users import engine

    with engine.connect() as conn:
        conn.execute(
            insert(users_table).values(
                id=user_id,
                email=f"{role}{user_id}@test.com",
                hashed_password="x",
                is_active=True,
                role=role,
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )
        )
        conn.commit()
    return create_access_token(subject=str(user_id), role=role)


async def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestAllowedEmailsAccess:
    @pytest.mark.asyncio
    async def test_requires_authentication(self):
        async with await _client() as client:
            resp = await client.get("/api/v1/allowed-emails/")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_manager_forbidden(self):
        token = _seed_user("manager", 1)
        async with await _client() as client:
            resp = await client.get("/api/v1/allowed-emails/", headers=_headers(token))
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_regular_user_forbidden(self):
        token = _seed_user("user", 2)
        async with await _client() as client:
            resp = await client.get("/api/v1/allowed-emails/", headers=_headers(token))
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_list(self):
        token = _seed_user("admin", 3)
        async with await _client() as client:
            resp = await client.get("/api/v1/allowed-emails/", headers=_headers(token))
        assert resp.status_code == 200
        assert resp.json()["data"] == []


class TestAllowedEmailsCrud:
    @pytest.mark.asyncio
    async def test_admin_can_add_and_remove(self):
        token = _seed_user("admin", 4)
        async with await _client() as client:
            resp = await client.post(
                "/api/v1/allowed-emails/",
                json={"email": "newhire@test.com"},
                headers=_headers(token),
            )
            assert resp.status_code == 201, resp.text
            entry = resp.json()["data"]
            assert entry["email"] == "newhire@test.com"
            assert entry["registered"] is False

            listed = await client.get("/api/v1/allowed-emails/", headers=_headers(token))
            assert len(listed.json()["data"]) == 1

            deleted = await client.delete(
                f"/api/v1/allowed-emails/{entry['id']}", headers=_headers(token)
            )
            assert deleted.status_code == 200

            listed_again = await client.get("/api/v1/allowed-emails/", headers=_headers(token))
            assert listed_again.json()["data"] == []

    @pytest.mark.asyncio
    async def test_duplicate_email_rejected(self):
        token = _seed_user("admin", 5)
        async with await _client() as client:
            await client.post(
                "/api/v1/allowed-emails/", json={"email": "dup@test.com"}, headers=_headers(token)
            )
            resp = await client.post(
                "/api/v1/allowed-emails/", json={"email": "dup@test.com"}, headers=_headers(token)
            )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_removing_missing_entry_returns_404(self):
        token = _seed_user("admin", 6)
        async with await _client() as client:
            resp = await client.delete(
                "/api/v1/allowed-emails/00000000-0000-0000-0000-000000000000",
                headers=_headers(token),
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_email_comparison_is_case_insensitive(self):
        token = _seed_user("admin", 7)
        async with await _client() as client:
            await client.post(
                "/api/v1/allowed-emails/", json={"email": "Case@Test.com"}, headers=_headers(token)
            )
            resp = await client.post(
                "/api/v1/allowed-emails/", json={"email": "case@test.com"}, headers=_headers(token)
            )
        assert resp.status_code == 409


class TestRegistrationGate:
    @pytest.mark.asyncio
    async def test_unlisted_email_is_rejected(self):
        async with await _client() as client:
            resp = await client.post(
                "/api/v1/users/",
                json={"email": "stranger@test.com", "password": "secret123"},
            )
        assert resp.status_code == 403
        assert "not authorized" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_listed_email_can_register(self):
        token = _seed_user("admin", 8)
        async with await _client() as client:
            allow_resp = await client.post(
                "/api/v1/allowed-emails/",
                json={"email": "approved@test.com"},
                headers=_headers(token),
            )
            assert allow_resp.status_code == 201

            register_resp = await client.post(
                "/api/v1/users/",
                json={"email": "approved@test.com", "password": "secret123"},
            )
        assert register_resp.status_code == 201, register_resp.text

    @pytest.mark.asyncio
    async def test_removing_the_whitelist_entry_blocks_future_registration_but_not_the_existing_account(self):
        token = _seed_user("admin", 9)
        async with await _client() as client:
            allow_resp = await client.post(
                "/api/v1/allowed-emails/",
                json={"email": "revoked@test.com"},
                headers=_headers(token),
            )
            entry_id = allow_resp.json()["data"]["id"]

            first_attempt = await client.post(
                "/api/v1/users/",
                json={"email": "revoked@test.com", "password": "secret123"},
            )
            assert first_attempt.status_code == 201

            await client.delete(f"/api/v1/allowed-emails/{entry_id}", headers=_headers(token))

            # A second registration attempt for the same (now-revoked)
            # email is rejected by the whitelist check itself (which runs
            # before the duplicate-email check).
            second_attempt = await client.post(
                "/api/v1/users/",
                json={"email": "revoked@test.com", "password": "secret123"},
            )
            assert second_attempt.status_code == 403

            # ...but the account created on the first attempt still works.
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "revoked@test.com", "password": "secret123"},
            )
            assert login_resp.status_code == 200
