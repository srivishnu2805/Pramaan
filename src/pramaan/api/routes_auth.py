from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.api.schemas import TokenResponse, UserCreate, UserOut
from pramaan.audit import record_event
from pramaan.auth.core import authenticate_user, create_access_token, hash_password
from pramaan.auth.deps import get_current_user, require_admin
from pramaan.db import get_session
from pramaan.models import User
from pramaan.permissions import CLEARANCE_ORDER

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/session-expired", status_code=204)
async def session_expired(request: Request, session: AsyncSession = Depends(get_session)):
    """Called by the frontend when a 401 is received. Logs session expiry to the audit trail.
    Intentionally unauthenticated — the token is already invalid at this point.
    """
    ip = request.client.host if request.client else "unknown"
    await record_event(session, "auth.session_expired", actor_id=None, object_ref=ip)
    await session.commit()


@router.post("/token", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_session)
):
    user = await authenticate_user(session, form.username, form.password)
    if user is None:
        await record_event(session, "auth.failure", actor_id=None, object_ref=form.username)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    await record_event(session, "auth.login", actor_id=user.id)
    await session.commit()
    return TokenResponse(
        access_token=create_access_token(user.id, role=user.role, clearance=user.clearance)
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        department=user.department,
        clearance=user.clearance,
        disabled=user.disabled,
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all active users. Used by the frontend to populate the permissions dropdown."""
    result = await session.execute(select(User).where(User.disabled.is_(False)).order_by(User.username))
    return [
        UserOut(
            id=u.id,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            department=u.department,
            clearance=u.clearance,
            disabled=u.disabled,
        )
        for u in result.scalars().all()
    ]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    if body.clearance not in CLEARANCE_ORDER:
        raise HTTPException(status_code=400, detail="Unknown clearance")
    existing = await session.execute(select(User).where(User.username == body.username))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Username taken")
    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        department=body.department,
        clearance=body.clearance,
    )
    session.add(user)
    await session.flush()
    await record_event(session, "user.create", actor_id=admin.id, object_ref=str(user.id))
    await session.commit()
    await session.refresh(user)
    return UserOut(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        department=user.department,
        clearance=user.clearance,
        disabled=user.disabled,
    )
