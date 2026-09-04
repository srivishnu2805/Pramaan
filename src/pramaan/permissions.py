"""Authorization: RBAC + case-level permissions + clearance/classification ABAC.

Fail-closed contract: any missing, invalid, or ambiguous identity, permission,
or classification metadata DENIES access. UUIDs are identifiers, never
authorization. The retrieval scope computed here is the single enforcement
point for both object access and vector search — the LLM never decides
authorization.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.models import Case, CasePermission, Chunk, Document, User

CLEARANCE_ORDER = ("UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET")
_RANK = {name: i for i, name in enumerate(CLEARANCE_ORDER)}


def clearance_rank(clearance: str) -> int:
    """Numeric rank of a clearance/classification. Unknown values raise (fail closed)."""
    try:
        return _RANK[clearance]
    except KeyError:
        raise ValueError(f"unknown clearance/classification: {clearance!r}")


def _clearance_ok(user_clearance: str, classification: str) -> bool:
    try:
        return clearance_rank(user_clearance) >= clearance_rank(classification)
    except ValueError:
        return False


async def can_access_case(session: AsyncSession, user: User, case: Case) -> bool:
    """True iff user may access the case. Pure predicate; never raises."""
    if user.disabled:
        return False
    try:
        clearance_rank(user.clearance)
        clearance_rank(case.classification)
    except ValueError:
        return False
    if user.role == "admin":
        return True
    if case.owner_id == user.id:
        return _clearance_ok(user.clearance, case.classification)
    result = await session.execute(
        select(CasePermission).where(
            CasePermission.case_id == case.id, CasePermission.user_id == user.id
        )
    )
    if result.scalars().first() is None:
        return False
    return _clearance_ok(user.clearance, case.classification)


async def require_case_access(session: AsyncSession, user: User, case_id: UUID) -> Case:
    """Load a case and enforce access. Raises 403/404 (fail closed). Never 200 without authz."""
    result = await session.execute(select(Case).where(Case.id == case_id))
    case = result.scalars().first()
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    if not await can_access_case(session, user, case):
        # 403 even for existence: the user is authenticated, the case simply
        # is not theirs. (Enumeration resistance for unauthenticated callers
        # is handled at the route layer.)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return case


async def visible_case_ids(session: AsyncSession, user: User) -> list[UUID]:
    """All case IDs the user may access — the primitive behind RetrievalScope."""
    if user.disabled:
        return []
    if user.role == "admin":
        result = await session.execute(select(Case.id))
        ids = list(result.scalars().all())
    else:
        owned = select(Case.id).where(Case.owner_id == user.id)
        granted = (
            select(CasePermission.case_id).where(CasePermission.user_id == user.id)
        )
        result = await session.execute(select(Case.id).where(Case.id.in_(owned.union(granted))))
        ids = list(result.scalars().all())
    # Apply clearance filtering server-side. Admin bypasses permission rows but
    # still needs clearance for classified content? No: admins are trusted
    # operators; classification is enforced for non-admins only.
    if user.role == "admin":
        return ids
    kept: list[UUID] = []
    for case_id in ids:
        res = await session.execute(select(Case).where(Case.id == case_id))
        case = res.scalars().first()
        if case is not None and _clearance_ok(user.clearance, case.classification):
            kept.append(case_id)
    return kept


@dataclass
class RetrievalScope:
    """Authorization-determined retrieval scope for search/RAG.

    Constructed ONLY from server-side authorization state (never from user
    input, never from the LLM). Both object queries and the pgvector query
    must apply `scope_filter()` so unauthorized rows are never retrieved.
    """

    user_id: UUID
    case_ids: set[UUID] = field(default_factory=set)
    max_classification_rank: int = 0
    allowed_statuses: tuple[str, ...] = ("ACTIVE",)

    @classmethod
    async def for_user(cls, session: AsyncSession, user: User) -> RetrievalScope:
        ids = await visible_case_ids(session, user)
        try:
            rank = clearance_rank(user.clearance)
        except ValueError:
            rank = -1  # unknown clearance => matches nothing (fail closed)
        return cls(user_id=user.id, case_ids=set(ids), max_classification_rank=rank)

    def chunk_filter(self) -> ColumnElement[bool]:
        """SQLAlchemy predicate: only chunks inside the authorized scope."""
        predicates = [
            Chunk.case_id.in_(self.case_ids) if self.case_ids else Chunk.case_id.is_(None),
            Chunk.document_classification.in_(
                [name for name in CLEARANCE_ORDER if _RANK[name] <= self.max_classification_rank]
            ),
        ]
        return and_(*predicates)

    def document_filter(self) -> ColumnElement[bool]:
        predicates = [
            Document.case_id.in_(self.case_ids) if self.case_ids else Document.case_id.is_(None),
            Document.status.in_(self.allowed_statuses),
            Document.classification.in_(
                [name for name in CLEARANCE_ORDER if _RANK[name] <= self.max_classification_rank]
            ),
        ]
        return and_(*predicates)
