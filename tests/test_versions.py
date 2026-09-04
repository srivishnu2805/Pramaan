from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select, update

from pramaan.audit import record_event, verify_chain
from pramaan.auth.core import hash_password
from pramaan.models import Case, Document, DocumentVersion, User
from pramaan.permissions import RetrievalScope
from pramaan.services.documents import (
    add_version,
    create_document,
    list_documents,
    set_status,
    verify_integrity,
)


async def _user(session, username, **kw):
    defaults = dict(role="investigator", clearance="SECRET")
    defaults.update(kw)
    u = User(username=username, hashed_password=hash_password("pw"), **defaults)
    session.add(u)
    await session.flush()
    return u


async def _case(session, owner, classification="CONFIDENTIAL"):
    c = Case(title="case", classification=classification, owner_id=owner.id)
    session.add(c)
    await session.flush()
    return c


async def test_create_document_produces_signed_v1(session):
    alice = await _user(session, "alice-doc")
    case = await _case(session, alice)
    doc = await create_document(session, alice, case.id, "FIR-001", "CONFIDENTIAL", b"body bytes")
    res = await session.execute(select(DocumentVersion).where(DocumentVersion.document_id == doc.id))
    versions = res.scalars().all()
    assert len(versions) == 1
    assert versions[0].version_number == 1
    assert versions[0].signature  # signed
    assert versions[0].previous_version_id is None
    assert versions[0].content != b"body bytes"  # ciphertext, not plaintext


async def test_add_version_preserves_history(session):
    alice = await _user(session, "alice-hist")
    case = await _case(session, alice)
    doc = await create_document(session, alice, case.id, "FIR-002", "CONFIDENTIAL", b"v1")
    v2 = await add_version(session, alice, doc.id, b"v2 content")
    assert v2.version_number == 2
    # v1 row untouched: refetch and confirm same hash.
    res = await session.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == doc.id, DocumentVersion.version_number == 1
        )
    )
    v1 = res.scalars().one()
    assert v1.previous_version_id is None
    assert v2.previous_version_id == v1.id
    # Integrity of both versions verifies.
    assert (await verify_integrity(session, doc.id, 1))["valid"]
    assert (await verify_integrity(session, doc.id, 2))["valid"]


async def test_tampered_bytes_fail_integrity(session):
    alice = await _user(session, "alice-tamper")
    case = await _case(session, alice)
    doc = await create_document(session, alice, case.id, "FIR-003", "CONFIDENTIAL", b"original")
    await session.execute(
        update(DocumentVersion)
        .where(DocumentVersion.document_id == doc.id)
        .values(content=b"attacker-ciphertext")
    )
    await session.flush()
    result = await verify_integrity(session, doc.id, 1)
    assert not result["valid"]
    assert result["hash_ok"] is False


async def test_tampered_signature_detected(session):
    alice = await _user(session, "alice-sig")
    case = await _case(session, alice)
    doc = await create_document(session, alice, case.id, "FIR-004", "CONFIDENTIAL", b"original")
    await session.execute(
        update(DocumentVersion)
        .where(DocumentVersion.document_id == doc.id)
        .values(signature=b"\x00" * 256)
    )
    await session.flush()
    result = await verify_integrity(session, doc.id, 1)
    assert not result["valid"]
    assert result["signature_ok"] is False


async def test_unauthorized_user_cannot_create_in_case(session):
    alice = await _user(session, "alice-x")
    bob = await _user(session, "bob-x")
    case = await _case(session, bob)
    with pytest.raises(HTTPException) as exc:
        await create_document(session, alice, case.id, "nope", "CONFIDENTIAL", b"x")
    assert exc.value.status_code == 403


async def test_concurrent_duplicate_version_blocked_by_constraint(session):
    from sqlalchemy.exc import IntegrityError

    alice = await _user(session, "alice-race")
    case = await _case(session, alice)
    doc = await create_document(session, alice, case.id, "FIR-005", "CONFIDENTIAL", b"v1")
    v2 = await add_version(session, alice, doc.id, b"v2")
    assert v2.version_number == 2
    # A racing writer reusing version_number 2 violates the UNIQUE constraint.
    dup = DocumentVersion(
        document_id=doc.id,
        version_number=2,
        content=b"x",
        ciphertext_nonce=b"y",
        wrapped_dek=b"z",
        kms_key_id="k",
        content_hash="h",
        metadata_hash="m",
        created_by=alice.id,
        classification="CONFIDENTIAL",
        signature=b"s",
        manifest="{}",
    )
    session.add(dup)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_status_transitions_explicit_and_audited(session):
    alice = await _user(session, "alice-life")
    case = await _case(session, alice)
    doc = await create_document(session, alice, case.id, "FIR-006", "CONFIDENTIAL", b"v1")
    await set_status(session, alice, doc.id, "ARCHIVED")
    await session.refresh(doc)
    assert doc.status == "ARCHIVED"
    ok, _ = await verify_chain(session)
    assert ok


async def test_list_documents_respects_scope(session):
    alice = await _user(session, "alice-list")
    bob = await _user(session, "bob-list")
    case_a = await _case(session, alice)
    case_b = await _case(session, bob)
    await create_document(session, alice, case_a.id, "A-doc", "CONFIDENTIAL", b"a")
    await create_document(session, bob, case_b.id, "B-doc", "CONFIDENTIAL", b"b")
    scope = await RetrievalScope.for_user(session, alice)
    docs = await list_documents(session, scope)
    titles = [d.title for d in docs]
    assert "A-doc" in titles
    assert "B-doc" not in titles
