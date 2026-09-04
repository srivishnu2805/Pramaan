from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.api.schemas import PermissionGrant, PermissionOut
from pramaan.auth.deps import get_current_user
from pramaan.db import get_session
from pramaan.models import User
from pramaan.services import cases as service

router = APIRouter(prefix="/cases/{case_id}/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionOut])
async def list_permissions(
    case_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = await service.list_permissions(session, user, case_id)
    return [
        PermissionOut(id=r.id, case_id=r.case_id, user_id=r.user_id, level=r.level) for r in rows
    ]


@router.post("", response_model=PermissionOut, status_code=201)
async def grant_permission(
    case_id: UUID,
    body: PermissionGrant,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    row = await service.grant_permission(session, user, case_id, body.user_id, body.level)
    await session.commit()
    return PermissionOut(id=row.id, case_id=row.case_id, user_id=row.user_id, level=row.level)


@router.delete("/{target_user_id}", status_code=204)
async def revoke_permission(
    case_id: UUID,
    target_user_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await service.revoke_permission(session, user, case_id, target_user_id)
    await session.commit()
