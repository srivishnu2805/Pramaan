from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException

from pramaan.auth.core import create_access_token, decode_token, hash_password, verify_password
from pramaan.auth.deps import get_current_user
from pramaan.models import User


def test_password_hash_verify_roundtrip():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_hashes_are_salted():
    assert hash_password("same") != hash_password("same")


def test_token_roundtrip():
    user_id = uuid4()
    token = create_access_token(user_id, role="investigator", clearance="SECRET")
    claims = decode_token(token)
    assert claims["sub"] == str(user_id)
    assert claims["role"] == "investigator"
    assert claims["clearance"] == "SECRET"


def test_token_expiry_enforced():
    token = create_access_token(uuid4(), expires_delta=timedelta(seconds=-1))
    with pytest.raises(HTTPException) as exc:
        decode_token(token)
    assert exc.value.status_code == 401


def test_tampered_token_rejected():
    token = create_access_token(uuid4())
    with pytest.raises(HTTPException) as exc:
        decode_token(token + "tamper")
    assert exc.value.status_code == 401


async def test_get_current_user_loads_from_db(session):
    user = User(
        username="investigator-1",
        hashed_password=hash_password("pw"),
        role="investigator",
        clearance="SECRET",
    )
    session.add(user)
    await session.flush()
    token = create_access_token(user.id)
    loaded = await get_current_user(session, token)
    assert loaded.id == user.id
    assert loaded.username == "investigator-1"


async def test_disabled_user_denied(session):
    user = User(
        username="disabled-1",
        hashed_password=hash_password("pw"),
        role="investigator",
        clearance="SECRET",
        disabled=True,
    )
    session.add(user)
    await session.flush()
    token = create_access_token(user.id)
    with pytest.raises(HTTPException) as exc:
        await get_current_user(session, token)
    assert exc.value.status_code == 403


async def test_unknown_user_denied(session):
    token = create_access_token(uuid4())
    with pytest.raises(HTTPException) as exc:
        await get_current_user(session, token)
    assert exc.value.status_code == 401
