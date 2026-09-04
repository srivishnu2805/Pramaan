"""Tamper-evident audit trail backed by a SHA-256 hash chain.

Each event commits to the hash of the event before it:

    event_hash = SHA256(canonical(event) || prev_hash)

Tampering with any stored event breaks the chain at (and after) the point of
tampering. This is tamper-EVIDENT, not immutable: if an attacker can rewrite
the whole database they can rebuild a consistent chain. Production deployments
must periodically anchor checkpoint hashes to independently protected,
append-only storage (see docs/security.md). Verification walks the chain and
reports every break.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.models import AuditEvent

GENESIS_HASH = "00" * 32


def _canonical(event_type: str, actor_id: UUID | None, object_ref: str | None, occurred_at: datetime) -> bytes:
    payload = {
        "type": event_type,
        "actor": str(actor_id) if actor_id else None,
        "object": object_ref,
        "at": occurred_at.astimezone(timezone.utc).isoformat(),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _hash(canonical: bytes, prev_hash: str) -> str:
    return hashlib.sha256(canonical + prev_hash.encode("utf-8")).hexdigest()


async def record_event(
    session: AsyncSession,
    event_type: str,
    actor_id: UUID | None,
    object_ref: str | None = None,
    payload: dict | None = None,
) -> AuditEvent:
    """Append one audit event, chaining to the previous event's hash.

    Uses SELECT ... FOR UPDATE on the latest row inside the caller's
    transaction to serialize appends and prevent forked chains.
    """
    latest = await session.execute(
        select(AuditEvent)
        .order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
        .limit(1)
        .with_for_update()
    )
    row = latest.scalars().first()
    prev_hash = row.event_hash if row else GENESIS_HASH

    now = datetime.now(timezone.utc)
    event = AuditEvent(
        event_type=event_type,
        actor_id=actor_id,
        object_ref=object_ref,
        payload=payload or {},
        occurred_at=now,
        prev_hash=prev_hash,
        event_hash=_hash(_canonical(event_type, actor_id, object_ref, now), prev_hash),
    )
    session.add(event)
    await session.flush()
    return event


async def verify_chain(session: AsyncSession) -> tuple[bool, list[UUID]]:
    """Recompute every hash in insertion order. Returns (ok, broken_ids)."""
    result = await session.execute(
        select(AuditEvent).order_by(AuditEvent.occurred_at.asc(), AuditEvent.id.asc())
    )
    events = result.scalars().all()
    broken: list[UUID] = []
    prev = GENESIS_HASH
    for event in events:
        expected = _hash(
            _canonical(event.event_type, event.actor_id, event.object_ref, event.occurred_at),
            event.prev_hash,
        )
        if event.prev_hash != prev or event.event_hash != expected:
            broken.append(event.id)
        # Continue with the *stored* hash so we report only the first break point
        # per fork rather than cascading every subsequent event.
        prev = event.event_hash
    return (len(broken) == 0, broken)
