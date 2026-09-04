from __future__ import annotations

import pytest
from sqlalchemy import select, update

from pramaan.audit import record_event, verify_chain
from pramaan.models import AuditEvent


async def test_chain_verifies_clean(session):
    a = await record_event(session, "login", actor_id=None, object_ref="user-a")
    b = await record_event(session, "document.view", actor_id=None, object_ref="doc-1")
    assert b.prev_hash == a.event_hash
    ok, breaks = await verify_chain(session)
    assert ok
    assert breaks == []


async def test_payload_tamper_detected(session):
    await record_event(session, "login", actor_id=None)
    victim = await record_event(session, "permission.grant", actor_id=None, object_ref="case-1")
    await record_event(session, "document.view", actor_id=None)
    # Attacker rewrites the middle event's payload in the DB.
    await session.execute(
        update(AuditEvent).where(AuditEvent.id == victim.id).values(object_ref="case-2")
    )
    await session.flush()
    ok, breaks = await verify_chain(session)
    assert not ok
    assert victim.id in breaks


async def test_prev_hash_rewrite_detected(session):
    first = await record_event(session, "login", actor_id=None)
    second = await record_event(session, "document.view", actor_id=None)
    assert second.prev_hash == first.event_hash
    # Attacker tries to splice the chain by pointing elsewhere.
    await session.execute(
        update(AuditEvent).where(AuditEvent.id == second.id).values(prev_hash="00" * 32)
    )
    await session.flush()
    ok, breaks = await verify_chain(session)
    assert not ok
    assert second.id in breaks


async def test_empty_chain_verifies(session):
    ok, breaks = await verify_chain(session)
    assert ok
    assert breaks == []


async def test_genesis_prev_hash_is_zero(session):
    first = await record_event(session, "login", actor_id=None)
    assert first.prev_hash == "00" * 32
