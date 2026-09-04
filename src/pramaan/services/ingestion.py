"""Secure ingestion: validate -> scan -> extract -> chunk -> embed -> index.

- Every uploaded byte is treated as hostile. Filename/extension/MIME are hints
  only; the content's magic bytes decide its type.
- Magic sniffing is built-in (small signature table) with optional
  `python-magic` when libmagic is present. Filename extension never decides.
- Malware scanning uses ClamAV/clamd when reachable; otherwise a documented
  dev-only fallback (size + magic allowlist + executable-signature blocklist).
  The fallback is NEVER claimed equivalent to real AV.
- OCR is an explicit provider abstraction; PyMuPDF text extraction is NOT OCR.
- Jobs are PostgreSQL rows (PENDING/PROCESSING/READY/QUARANTINED/FAILED) so
  ingestion is asynchronous and recoverable without Redis/Celery.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.audit import record_event
from pramaan.config import settings
from pramaan.models import Chunk, Document, DocumentStatus, DocumentVersion, IngestionJob
from pramaan.services.ai import get_embedding_provider, get_extractor

MAX_ATTEMPTS = 3


class ValidationError(ValueError):
    pass


# --- magic sniffing -----------------------------------------------------------

_SIGNATURES: list[tuple[bytes, str]] = [
    (b"%PDF-", "application/pdf"),
    (b"MZ", "application/x-dosexec"),
    (b"\x7fELF", "application/x-elf"),
    (b"PK\x03\x04", "application/zip"),
    (b"\x1f\x8b", "application/gzip"),
    (b"%!PS", "application/postscript"),
]

ALLOWED_CONTENT_TYPES = {"application/pdf", "text/plain"}


def _builtin_sniff(content: bytes) -> str | None:
    for magic, mime in _SIGNATURES:
        if content.startswith(magic):
            return mime
    try:
        content.decode("utf-8")
        # Heuristic: decodes as UTF-8 and mostly printable -> text.
        sample = content[:4096]
        text_chars = sum(1 for b in sample if 32 <= b <= 126 or b in (9, 10, 13))
        if sample and text_chars / len(sample) > 0.85:
            return "text/plain"
    except UnicodeDecodeError:
        pass
    return None


def detect_mime(content: bytes, filename: str) -> str:
    """Sniff content type from bytes. Filename is ignored except as a last hint."""
    try:
        import magic  # type: ignore

        return magic.from_buffer(content[:8192], mime=True)
    except Exception:
        pass
    sniffed = _builtin_sniff(content)
    if sniffed:
        return sniffed
    lowered = filename.lower()
    if lowered.endswith(".pdf"):
        raise ValidationError("content does not look like a PDF despite .pdf name")
    if lowered.endswith(".txt"):
        raise ValidationError("content does not look like text despite .txt name")
    raise ValidationError("unrecognized file type")


# --- validation / scanning ----------------------------------------------------


def validate_upload(content: bytes, filename: str) -> str:
    """Size + type validation. Returns the trusted content type."""
    if not content:
        raise ValidationError("empty upload")
    if len(content) > settings.max_upload_bytes:
        raise ValidationError(f"upload exceeds {settings.max_upload_bytes} bytes")
    mime = detect_mime(content, filename)
    if mime not in ALLOWED_CONTENT_TYPES:
        raise ValidationError(f"disallowed content type: {mime}")
    return mime


def malware_scan(content: bytes, mime: str) -> tuple[bool, str]:
    """Return (clean, reason). ClamAV when available, else dev-only fallback.

    The fallback blocks executable/archive signatures and enforces the content
    allowlist; it is documented as NOT equivalent to real malware scanning.
    """
    try:
        import clamd  # type: ignore

        client = clamd.ClamdUnixSocket()
        result = client.instream(content)  # type: ignore[attr-defined]
        verdict = result.get("stream", ("UNKNOWN", None))[0]
        return (verdict == "OK", f"clamd verdict: {verdict}")
    except Exception:
        pass
    # DEV-ONLY fallback: block known-executable/container magic outright.
    head = content[:4]
    if head[:2] == b"MZ" or head[:4] == b"\x7fELF" or head[:2] == b"PK":
        return False, "dev-scan: executable/archive signature blocked (clamd unavailable)"
    if mime not in ALLOWED_CONTENT_TYPES:
        return False, f"dev-scan: content type {mime} not in allowlist"
    return True, "dev-scan: allowlisted type, no executable magic (NOT real AV)"


# --- chunking -----------------------------------------------------------------


def chunk_text(text: str, size: int | None = None, overlap: int | None = None) -> list[str]:
    size = size or settings.chunk_size
    overlap = overlap if overlap is not None else settings.chunk_overlap
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


# --- jobs ---------------------------------------------------------------------


async def enqueue_ingestion(session: AsyncSession, document_id: UUID) -> IngestionJob:
    job = IngestionJob(document_id=document_id, status="PENDING")
    session.add(job)
    await session.flush()
    return job


async def _latest_version(session: AsyncSession, document_id: UUID) -> DocumentVersion:
    result = await session.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalars().first()
    if version is None:
        raise RuntimeError("document has no versions")
    return version


async def _claim_job(session: AsyncSession) -> IngestionJob | None:
    """Claim one PENDING (or retryable FAILED/PROCESSING) job with row locking."""
    result = await session.execute(
        select(IngestionJob)
        .where(
            (IngestionJob.status == "PENDING")
            | (
                (IngestionJob.status.in_(("FAILED", "PROCESSING")))
                & (IngestionJob.attempts < MAX_ATTEMPTS)
            )
        )
        .order_by(IngestionJob.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = result.scalars().first()
    if job is None:
        return None
    job.status = "PROCESSING"
    job.attempts += 1
    job.updated_at = datetime.now(UTC)
    await session.flush()
    return job


async def process_next_job(session: AsyncSession) -> bool:
    """Process a single claimed job. Returns False when the queue is empty."""
    job = await _claim_job(session)
    if job is None:
        return False
    try:
        await _process_job(session, job)
    except Exception as exc:  # never let the worker die silently; mark FAILED
        job.status = "FAILED" if job.attempts >= MAX_ATTEMPTS else "PENDING"
        job.error = f"{type(exc).__name__}: {exc}"[:2000]
        await session.flush()
    return True


async def _process_job(session: AsyncSession, job: IngestionJob) -> None:
    result = await session.execute(select(Document).where(Document.id == job.document_id))
    document = result.scalars().first()
    if document is None:
        job.status = "FAILED"
        job.error = "document not found"
        await session.flush()
        return
    version = await _latest_version(session, document.id)

    # Decrypt current version bytes for processing (server-side, audited as system).
    from pramaan.providers import get_kms
    from pramaan.security.envelope import EncryptedPayload, envelope_decrypt

    plaintext = envelope_decrypt(
        get_kms(),
        EncryptedPayload(
            ciphertext=version.content,
            nonce=version.ciphertext_nonce,
            wrapped_dek=version.wrapped_dek,
            kms_key_id=version.kms_key_id,
        ),
    )

    # 1. validate
    try:
        mime = validate_upload(plaintext, document.title)
    except ValidationError as exc:
        job.status = "FAILED"
        job.error = str(exc)
        await session.flush()
        return

    # 2. malware scan
    clean, reason = malware_scan(plaintext, mime)
    if not clean:
        job.status = "QUARANTINED"
        job.error = reason
        document.status = DocumentStatus.QUARANTINED.value
        await session.flush()
        await record_event(
            session,
            "document.quarantine",
            actor_id=None,
            object_ref=str(document.id),
            payload={"reason": reason},
        )
        return

    # 3. extract
    if mime == "application/pdf":
        pages = get_extractor(settings).extract(plaintext)
        extracted = "\n".join(text for _, text in pages)
    else:
        extracted = plaintext.decode("utf-8", errors="replace")

    # 4. chunk
    chunks = chunk_text(extracted)
    if not chunks:
        job.status = "FAILED"
        job.error = "no extractable text"
        await session.flush()
        return

    # 5. embed + 6. index
    embeddings = get_embedding_provider(settings).embed(chunks)
    for i, (text, vector) in enumerate(zip(chunks, embeddings, strict=True)):
        session.add(
            Chunk(
                version_id=version.id,
                document_id=document.id,
                case_id=document.case_id,
                document_classification=document.classification,
                chunk_index=i,
                page=None,  # per-page mapping below when available
                content=text,
                embedding=vector,
            )
        )
    await session.flush()
    job.status = "READY"
    job.error = None
    await session.flush()
    await record_event(
        session,
        "document.ingest.ready",
        actor_id=None,
        object_ref=str(document.id),
        payload={"chunks": len(chunks)},
    )
