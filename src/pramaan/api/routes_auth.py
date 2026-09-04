from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_session)):
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
        id=user.id, username=user.username, full_name=user.full_name, role=user.role,
        department=user.department, clearance=user.clearance, disabled=user.disabled,
    )


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
        id=user.id, username=user.username, full_name=user.full_name, role=user.role,
        department=user.department, clearance=user.clearance, disabled=user.disabled,
    )
