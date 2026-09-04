from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.api.schemas import CaseCreate, CaseOut
from pramaan.auth.deps import get_current_user
from pramaan.db import get_session
from pramaan.models import User
from pramaan.services import cases as service

router = APIRouter(prefix="/cases", tags=["cases"])


def _out(case) -> CaseOut:
    return CaseOut(
        id=case.id,
        title=case.title,
        classification=case.classification,
        description=case.description,
        owner_id=case.owner_id,
        status=case.status,
        created_at=case.created_at,
    )


@router.post("", response_model=CaseOut, status_code=201)
async def create_case(
    body: CaseCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    case = await service.create_case(
        session, user, body.title, body.classification, body.description
    )
    await session.commit()
    return _out(case)


@router.get("", response_model=list[CaseOut])
async def list_cases(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = await service.list_cases(session, user, limit=limit, offset=offset)
    return [_out(c) for c in rows]


@router.get("/{case_id}", response_model=CaseOut)
async def get_case(
    case_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    case = await service.get_case(session, user, case_id)
    return _out(case)
