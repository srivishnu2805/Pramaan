from __future__ import annotations

import pytest
from fastapi import HTTPException

from pramaan.auth.core import hash_password
from pramaan.models import Case, CasePermission, User
from pramaan.permissions import (
    RetrievalScope,
    can_access_case,
    clearance_rank,
    require_case_access,
    visible_case_ids,
)


async def _user(session, username, role="investigator", clearance="SECRET", **kw):
    u = User(username=username, hashed_password=hash_password("pw"), role=role, clearance=clearance, **kw)
    session.add(u)
    await session.flush()
    return u


async def _case(session, owner, classification="CONFIDENTIAL", title="case"):
    c = Case(title=title, classification=classification, owner_id=owner.id)
    session.add(c)
    await session.flush()
    return c


def test_clearance_rank_ordering():
    assert clearance_rank("UNCLASSIFIED") < clearance_rank("RESTRICTED")
    assert clearance_rank("RESTRICTED") < clearance_rank("CONFIDENTIAL")
    assert clearance_rank("CONFIDENTIAL") < clearance_rank("SECRET")
    assert clearance_rank("SECRET") < clearance_rank("TOP SECRET")


def test_unknown_clearance_fails_closed():
    with pytest.raises(ValueError):
        clearance_rank("BOGUS")


async def test_owner_can_access(session):
    owner = await _user(session, "owner")
    other = await _user(session, "other")
    case = await _case(session, owner)
    assert await can_access_case(session, owner, case)
    assert not await can_access_case(session, other, case)


async def test_permission_grant_gives_access(session):
    owner = await _user(session, "owner2")
    viewer = await _user(session, "viewer2")
    case = await _case(session, owner)
    session.add(CasePermission(case_id=case.id, user_id=viewer.id, level="VIEW"))
    await session.flush()
    assert await can_access_case(session, viewer, case)


async def test_insufficient_clearance_denies(session):
    owner = await _user(session, "owner3", clearance="TOP SECRET")
    low = await _user(session, "low3", clearance="CONFIDENTIAL")
    case = await _case(session, owner, classification="SECRET")
    # Even with an explicit grant, clearance below classification denies (fail closed).
    session.add(CasePermission(case_id=case.id, user_id=low.id, level="VIEW"))
    await session.flush()
    assert not await can_access_case(session, low, case)


async def test_admin_bypass(session):
    owner = await _user(session, "owner4")
    admin = await _user(session, "admin4", role="admin", clearance="TOP SECRET")
    case = await _case(session, owner)
    assert await can_access_case(session, admin, case)


async def test_visible_case_ids_scoped(session):
    alice = await _user(session, "alice")
    bob = await _user(session, "bob")
    case_a = await _case(session, alice, title="A")
    case_b = await _case(session, bob, title="B")
    visible = await visible_case_ids(session, alice)
    assert case_a.id in visible
    assert case_b.id not in visible


async def test_require_case_access_raises_403(session):
    alice = await _user(session, "alice5")
    bob = await _user(session, "bob5")
    case = await _case(session, bob, title="B5")
    with pytest.raises(HTTPException) as exc:
        await require_case_access(session, alice, case.id)
    assert exc.value.status_code == 403


async def test_retrieval_scope_contains_only_authorized(session):
    alice = await _user(session, "alice6", clearance="SECRET")
    bob = await _user(session, "bob6")
    case_a = await _case(session, alice, title="A6")
    case_b = await _case(session, bob, title="B6")
    scope = await RetrievalScope.for_user(session, alice)
    assert case_a.id in scope.case_ids
    assert case_b.id not in scope.case_ids
