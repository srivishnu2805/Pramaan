from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.audit import verify_chain
from pramaan.auth.deps import get_current_user
from pramaan.db import get_session
from pramaan.models import AuditEvent, User

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditOut(BaseModel):
    id: UUID
    event_type: str
    actor_id: UUID | None
    object_ref: str | None
    occurred_at: str
    event_hash: str


class VerifyOut(BaseModel):
    valid: bool
    broken: list[UUID]


@router.get("", response_model=list[AuditOut])
async def list_events(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    event_type: str | None = Query(default=None, max_length=64),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AuditEvent).order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        AuditOut(
            id=r.id,
            event_type=r.event_type,
            actor_id=r.actor_id,
            object_ref=r.object_ref,
            occurred_at=r.occurred_at.isoformat(),
            event_hash=r.event_hash,
        )
        for r in rows
    ]


@router.get("/verify", response_model=VerifyOut)
async def verify(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    ok, broken = await verify_chain(session)
    return VerifyOut(valid=ok, broken=broken)
