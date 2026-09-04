"""Authentication primitives: password hashing (Argon2 via pwdlib) and JWT.

The app never implements its own auth protocol: OAuth2 bearer tokens (PyJWT,
HS256) for API calls. The auth abstraction boundary is `get_current_user` in
deps.py, so a future OIDC/enterprise-IdP backend can replace JWT issuance
without touching authorization logic.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import HTTPException, status
from pwdlib import PasswordHash

from pramaan.config import settings

_password_hash = PasswordHash.recommended()
DUMMY_HASH = _password_hash.hash("pramaan-dummy-password")


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _password_hash.verify(password, hashed)
    except Exception:
        return False


def create_access_token(
    user_id: UUID,
    role: str = "",
    clearance: str = "",
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    return jwt.encode(
        {
            "sub": str(user_id),
            "role": role,
            "clearance": clearance,
            "iat": int(now.timestamp()),
            "exp": int(expire.timestamp()),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict:
    """Decode and validate a bearer token. Raises 401 on any failure (fail closed)."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload
