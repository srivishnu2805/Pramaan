"""Document lifecycle: immutable versioning, encryption, signing, auditing.

- Content is envelope-encrypted before storage (ciphertext in `bytea`).
- Versions are append-only; existing rows are never mutated by these services.
- Each version carries SHA-256(content), SHA-256(metadata), and an RSA-PSS
  signature over the canonical manifest.
- Version creation, status transitions, and verification are all audited.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.audit import record_event
from pramaan.models import Document, DocumentStatus, DocumentVersion, User
from pramaan.permissions import RetrievalScope, require_case_access
from pramaan.providers import get_kms, get_signer
from pramaan.security.envelope import EncryptedPayload, envelope_decrypt, envelope_encrypt
from pramaan.security.hashing import canonical_manifest, sha256_bytes


def _metadata_hash(document_id: UUID, title: str, classification: str) -> str:
    return sha256_bytes(
        json.dumps(
            {"document_id": str(document_id), "title": title, "classification": classification},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    )


async def _next_version(session: AsyncSession, document_id: UUID) -> tuple[int, UUID | None]:
    result = await session.execute(
        select(func.max(DocumentVersion.version_number)).where(
            DocumentVersion.document_id == document_id
        )
    )
    current_max = result.scalar() or 0
    return current_max + 1, None


async def _build_version(
    session: AsyncSession,
    document: Document,
    creator: User,
    plaintext: bytes,
    version_number: int,
) -> DocumentVersion:
    payload = envelope_encrypt(get_kms(), plaintext)
    content_hash = sha256_bytes(plaintext)
    metadata_hash = _metadata_hash(document.id, document.title, document.classification)
    previous_id: UUID | None = None
    if version_number > 1:
        result = await session.execute(
            select(DocumentVersion.id).where(
                DocumentVersion.document_id == document.id,
                DocumentVersion.version_number == version_number - 1,
            )
        )
        previous_id = result.scalars().first()

    created_at = datetime.now(UTC)
    manifest = canonical_manifest(
        document.id,
        version_number,
        content_hash,
        metadata_hash,
        creator.id,
        created_at.isoformat(),
        document.classification,
    )
    signature = get_signer().sign(manifest)
    return DocumentVersion(
        document_id=document.id,
        version_number=version_number,
        content=payload.ciphertext,
        ciphertext_nonce=payload.nonce,
        wrapped_dek=payload.wrapped_dek,
        kms_key_id=payload.kms_key_id,
        content_hash=content_hash,
        metadata_hash=metadata_hash,
        previous_version_id=previous_id,
        created_by=creator.id,
        created_at=created_at,
        classification=document.classification,
        signature=signature,
        manifest=manifest.decode("utf-8"),
    )


async def create_document(
    session: AsyncSession,
    user: User,
    case_id: UUID,
    title: str,
    classification: str,
    plaintext: bytes,
) -> Document:
    case = await require_case_access(session, user, case_id)
    if document_classification_denied(user, classification):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Classification exceeds clearance"
        )
    document = Document(
        case_id=case.id, title=title, classification=classification, created_by=user.id
    )
    session.add(document)
    await session.flush()
    version = await _build_version(session, document, user, plaintext, version_number=1)
    session.add(version)
    await session.flush()
    await record_event(
        session,
        "document.create",
        actor_id=user.id,
        object_ref=str(document.id),
        payload={"case_id": str(case.id), "version": 1},
    )
    return document


async def add_version(
    session: AsyncSession, user: User, document_id: UUID, plaintext: bytes
) -> DocumentVersion:
    result = await session.execute(select(Document).where(Document.id == document_id))
    document = result.scalars().first()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await require_case_access(session, user, document.case_id)
    if document.status != DocumentStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Document is {document.status}"
        )
    next_number, _ = await _next_version(session, document.id)
    version = await _build_version(session, document, user, plaintext, next_number)
    session.add(version)
    await session.flush()
    await record_event(
        session,
        "document.version.create",
        actor_id=user.id,
        object_ref=str(document.id),
        payload={"version": next_number},
    )
    return version


async def set_status(
    session: AsyncSession, user: User, document_id: UUID, new_status: str
) -> Document:
    try:
        target = DocumentStatus(new_status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status"
        ) from None
    result = await session.execute(select(Document).where(Document.id == document_id))
    document = result.scalars().first()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await require_case_access(session, user, document.case_id)
    old = document.status
    document.status = target.value
    await session.flush()
    await record_event(
        session,
        "document.status.change",
        actor_id=user.id,
        object_ref=str(document.id),
        payload={"from": old, "to": target.value},
    )
    return document


async def decrypt_version(
    session: AsyncSession, user: User, document_id: UUID, version_number: int
) -> bytes:
    """Decrypt one version's content (authorization enforced, access audited)."""
    result = await session.execute(select(Document).where(Document.id == document_id))
    document = result.scalars().first()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await require_case_access(session, user, document.case_id)
    res = await session.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version_number == version_number,
        )
    )
    version = res.scalars().first()
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    plaintext = envelope_decrypt(
        get_kms(),
        EncryptedPayload(
            ciphertext=version.content,
            nonce=version.ciphertext_nonce,
            wrapped_dek=version.wrapped_dek,
            kms_key_id=version.kms_key_id,
        ),
    )
    await record_event(
        session,
        "document.view",
        actor_id=user.id,
        object_ref=str(document.id),
        payload={"version": version_number},
    )
    return plaintext


async def verify_integrity(session: AsyncSession, document_id: UUID, version_number: int) -> dict:
    """Recompute hashes and verify the manifest signature. Never raises on mismatch."""
    res = await session.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number == version_number,
        )
    )
    version = res.scalars().first()
    if version is None:
        return {"valid": False, "reason": "version not found"}
    try:
        plaintext = envelope_decrypt(
            get_kms(),
            EncryptedPayload(
                ciphertext=version.content,
                nonce=version.ciphertext_nonce,
                wrapped_dek=version.wrapped_dek,
                kms_key_id=version.kms_key_id,
            ),
        )
        hash_ok = sha256_bytes(plaintext) == version.content_hash
    except Exception:
        hash_ok = False
    signature_ok = get_signer().verify(version.manifest.encode("utf-8"), version.signature)
    return {
        "valid": bool(hash_ok and signature_ok),
        "hash_ok": hash_ok,
        "signature_ok": signature_ok,
        "content_hash": version.content_hash,
        "manifest": version.manifest,
    }


async def list_documents(session: AsyncSession, scope: RetrievalScope) -> list[Document]:
    result = await session.execute(select(Document).where(scope.document_filter()))
    return list(result.scalars().all())


def document_classification_denied(user: User, classification: str) -> bool:
    from pramaan.permissions import clearance_rank

    try:
        return clearance_rank(classification) > clearance_rank(user.clearance)
    except ValueError:
        return True
