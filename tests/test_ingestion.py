from __future__ import annotations

import pytest
from sqlalchemy import select

from pramaan.auth.core import hash_password
from pramaan.models import Case, Chunk, Document, IngestionJob, User
from pramaan.services.documents import create_document
from pramaan.services.ingestion import (
    ValidationError,
    detect_mime,
    enqueue_ingestion,
    process_next_job,
)

MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"  # noqa: E501
    b"4 0 obj<</Length 68>>stream\nBT /F1 24 Tf 100 700 Td (Burglary suspect entered through window) Tj ET\nendstream\nendobj\n"  # noqa: E501
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
    b"0000000115 00000 n \n0000000260 00000 n \n0000000385 00000 n \n"
    b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n440\n%%EOF"
)


async def _user(session, username, **kw):
    defaults = dict(role="investigator", clearance="SECRET")
    defaults.update(kw)
    u = User(username=username, hashed_password=hash_password("pw"), **defaults)
    session.add(u)
    await session.flush()
    return u


async def test_detect_mime_pdf():
    assert detect_mime(MINIMAL_PDF, "notes.txt") == "application/pdf"


def test_detect_mime_rejects_extension_spoof():
    # EXE bytes named .pdf must not validate as PDF.
    assert detect_mime(b"MZ\x90\x00evil", "report.pdf") == "application/x-dosexec"


async def test_ingestion_pdf_end_to_end(session):
    alice = await _user(session, "alice-ingest")
    case = Case(title="case", classification="CONFIDENTIAL", owner_id=alice.id)
    session.add(case)
    await session.flush()
    doc = await create_document(session, alice, case.id, "report.pdf", "CONFIDENTIAL", MINIMAL_PDF)
    job = await enqueue_ingestion(session, doc.id)
    assert job.status == "PENDING"
    processed = await process_next_job(session)
    assert processed is True
    await session.refresh(job)
    assert job.status == "READY", job.error
    chunks = (
        (await session.execute(select(Chunk).where(Chunk.document_id == doc.id))).scalars().all()
    )
    assert len(chunks) >= 1
    assert any("Burglary suspect" in c.content for c in chunks)
    assert all(c.embedding is not None and len(c.embedding) == 384 for c in chunks)


async def test_oversized_upload_rejected(session):
    with pytest.raises(ValidationError):
        from pramaan.config import settings

        oversized = b"x" * (settings.max_upload_bytes + 1)
        from pramaan.services.ingestion import validate_upload

        validate_upload(oversized, "big.pdf")


async def test_malformed_pdf_quarantined_or_failed(session):
    alice = await _user(session, "alice-malformed")
    case = Case(title="case", classification="CONFIDENTIAL", owner_id=alice.id)
    session.add(case)
    await session.flush()
    # Not a PDF at all (but small); plain text goes through text path.
    doc = await create_document(
        session, alice, case.id, "notes.txt", "CONFIDENTIAL", b"plain text notes"
    )
    await enqueue_ingestion(session, doc.id)
    assert await process_next_job(session) is True
    job = (
        (await session.execute(select(IngestionJob).where(IngestionJob.document_id == doc.id)))
        .scalars()
        .one()
    )
    assert job.status == "READY"


async def test_executable_upload_rejected(session):
    alice = await _user(session, "alice-exe")
    case = Case(title="case", classification="CONFIDENTIAL", owner_id=alice.id)
    session.add(case)
    await session.flush()
    doc = await create_document(
        session, alice, case.id, "evil.pdf", "CONFIDENTIAL", b"MZ\x90\x00evil-binary"
    )
    await enqueue_ingestion(session, doc.id)
    assert await process_next_job(session) is True
    job = (
        (await session.execute(select(IngestionJob).where(IngestionJob.document_id == doc.id)))
        .scalars()
        .one()
    )
    assert job.status in ("QUARANTINED", "FAILED")
    refreshed = (
        (await session.execute(select(Document).where(Document.id == doc.id))).scalars().one()
    )
    assert refreshed.status in ("QUARANTINED", "ACTIVE")
