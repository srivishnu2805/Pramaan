from __future__ import annotations

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from pramaan.api.app import create_app
from pramaan.auth.core import hash_password
from pramaan.db import get_session
from pramaan.models import User

app = create_app()


@pytest_asyncio.fixture
async def client(session):
    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _seed_user(
    session, username, password="password123", role="investigator", clearance="SECRET"
):
    u = User(
        username=username, hashed_password=hash_password(password), role=role, clearance=clearance
    )
    session.add(u)
    await session.flush()
    return u


async def _token(client, username, password="password123"):
    resp = await client.post("/auth/token", data={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def test_login_me_flow(session, client):
    await _seed_user(session, "api-alice")
    token = await _token(client, "api-alice")
    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "api-alice"


async def test_unauthenticated_denied(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_case_document_version_verify_flow(session, client):
    await _seed_user(session, "api-bob")
    token = await _token(client, "api-bob")
    headers = {"Authorization": f"Bearer {token}"}

    # Create case.
    resp = await client.post(
        "/cases", json={"title": "FIR-100", "classification": "CONFIDENTIAL"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    case_id = resp.json()["id"]

    # Upload document (text file; ingestion is separate).
    resp = await client.post(
        f"/cases/{case_id}/documents",
        data={"title": "statement.txt", "classification": "CONFIDENTIAL"},
        files={
            "file": ("statement.txt", b"The witness saw a blue sedan at midnight.", "text/plain")
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["id"]

    # List versions.
    resp = await client.get(f"/documents/{doc_id}/versions", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Verify integrity.
    resp = await client.get(f"/documents/{doc_id}/versions/1/verify", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["valid"] is True

    # Download (decrypt).
    resp = await client.get(f"/documents/{doc_id}/versions/1", headers=headers)
    assert resp.status_code == 200
    assert b"blue sedan" in resp.content

    # New version.
    resp = await client.post(
        f"/documents/{doc_id}/versions",
        files={
            "file": (
                "v2.txt",
                b"The witness saw a blue sedan at midnight. Plate XYZ-123.",
                "text/plain",
            )
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["version_number"] == 2


async def test_cross_user_document_forbidden(session, client):
    await _seed_user(session, "owner-u")
    await _seed_user(session, "intruder-u")
    owner_token = await _token(client, "owner-u")
    intruder_token = await _token(client, "intruder-u")

    resp = await client.post(
        "/cases",
        json={"title": "private", "classification": "CONFIDENTIAL"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    case_id = resp.json()["id"]
    resp = await client.post(
        f"/cases/{case_id}/documents",
        data={"title": "s.txt", "classification": "CONFIDENTIAL"},
        files={"file": ("s.txt", b"secret", "text/plain")},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    doc_id = resp.json()["id"]

    # Intruder cannot read, verify, or download.
    for url in (
        f"/documents/{doc_id}",
        f"/documents/{doc_id}/versions/1/verify",
        f"/documents/{doc_id}/versions/1",
    ):
        resp = await client.get(url, headers={"Authorization": f"Bearer {intruder_token}"})
        assert resp.status_code in (403, 404), url


async def test_audit_verify_endpoint(session, client):
    await _seed_user(session, "api-auditor")
    token = await _token(client, "api-auditor")
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/audit/verify", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["valid"] is True
