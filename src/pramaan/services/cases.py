"""Case management: creation, listing (scoped), updates, permissions."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.audit import record_event
from pramaan.models import Case, CasePermission, User
from pramaan.permissions import clearance_rank, visible_case_ids


async def create_case(
    session: AsyncSession,
    user: User,
    title: str,
    classification: str,
    description: str | None = None,
) -> Case:
    try:
        if clearance_rank(classification) > clearance_rank(user.clearance):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Classification exceeds clearance"
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown classification"
        ) from None
    case = Case(
        title=title, classification=classification, description=description, owner_id=user.id
    )
    session.add(case)
    await session.flush()
    await record_event(session, "case.create", actor_id=user.id, object_ref=str(case.id))
    return case


async def list_cases(
    session: AsyncSession, user: User, limit: int = 50, offset: int = 0
) -> list[Case]:
    ids = await visible_case_ids(session, user)
    if not ids:
        return []
    result = await session.execute(
        select(Case)
        .where(Case.id.in_(ids))
        .order_by(Case.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_case(session: AsyncSession, user: User, case_id: UUID) -> Case:
    from pramaan.permissions import require_case_access

    return await require_case_access(session, user, case_id)


async def _require_manage(session: AsyncSession, user: User, case_id: UUID) -> Case:
    from pramaan.permissions import require_case_access

    case = await require_case_access(session, user, case_id)
    if user.role == "admin" or case.owner_id == user.id:
        return case
    result = await session.execute(
        select(CasePermission).where(
            CasePermission.case_id == case.id, CasePermission.user_id == user.id
        )
    )
    perm = result.scalars().first()
    if perm is None or perm.level != "MANAGE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Manage permission required"
        )
    return case


async def grant_permission(
    session: AsyncSession, granter: User, case_id: UUID, target_user_id: UUID, level: str
) -> CasePermission:
    if level not in ("VIEW", "EDIT", "MANAGE"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid level")
    case = await _require_manage(session, granter, case_id)
    result = await session.execute(select(User).where(User.id == target_user_id))
    target = result.scalars().first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    existing = await session.execute(
        select(CasePermission).where(
            CasePermission.case_id == case.id, CasePermission.user_id == target.id
        )
    )
    row = existing.scalars().first()
    if row:
        row.level = level
    else:
        row = CasePermission(case_id=case.id, user_id=target.id, level=level)
        session.add(row)
    await session.flush()
    await record_event(
        session,
        "permission.grant",
        actor_id=granter.id,
        object_ref=str(case.id),
        payload={"target": str(target.id), "level": level},
    )
    return row


async def revoke_permission(
    session: AsyncSession, revoker: User, case_id: UUID, target_user_id: UUID
) -> None:
    case = await _require_manage(session, revoker, case_id)
    result = await session.execute(
        select(CasePermission).where(
            CasePermission.case_id == case.id, CasePermission.user_id == target_user_id
        )
    )
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")
    await session.delete(row)
    await session.flush()
    await record_event(
        session,
        "permission.revoke",
        actor_id=revoker.id,
        object_ref=str(case.id),
        payload={"target": str(target_user_id)},
    )


async def list_permissions(
    session: AsyncSession, user: User, case_id: UUID
) -> list[CasePermission]:
    from pramaan.permissions import require_case_access

    case = await require_case_access(session, user, case_id)
    result = await session.execute(select(CasePermission).where(CasePermission.case_id == case.id))
    return list(result.scalars().all())
