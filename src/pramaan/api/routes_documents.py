from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.api.schemas import DocumentOut, IntegrityOut, StatusChange, VersionOut
from pramaan.audit import record_event
from pramaan.auth.deps import get_current_user
from pramaan.config import settings
from pramaan.db import get_session
from pramaan.models import Document, DocumentVersion, User
from pramaan.permissions import RetrievalScope, require_case_access
from pramaan.services import documents as service
from pramaan.services.ingestion import enqueue_ingestion

router = APIRouter(tags=["documents"])


async def _version_count(session: AsyncSession, document_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).where(DocumentVersion.document_id == document_id)
    )
    return result.scalar() or 0


def _doc_out(doc: Document, version_count: int = 0) -> DocumentOut:
    return DocumentOut(
        id=doc.id, case_id=doc.case_id, title=doc.title,
        classification=doc.classification, status=doc.status,
        version_count=version_count, created_at=doc.created_at,
    )


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload")
    return content


@router.post("/cases/{case_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    case_id: UUID,
    title: str = Form(min_length=1, max_length=255),
    classification: str = Form(default="UNCLASSIFIED"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    content = await _read_upload(file)
    doc = await service.create_document(session, user, case_id, title, classification, content)
    await enqueue_ingestion(session, doc.id)
    await record_event(session, "document.upload", actor_id=user.id, object_ref=str(doc.id),
                       payload={"filename": file.filename, "bytes": len(content)})
    await session.commit()
    return _doc_out(doc, 1)


@router.get("/cases/{case_id}/documents", response_model=list[DocumentOut])
async def list_case_documents(
    case_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await require_case_access(session, user, case_id)
    scope = await RetrievalScope.for_user(session, user)
    result = await session.execute(
        select(Document).where(scope.document_filter(), Document.case_id == case_id)
        .order_by(Document.created_at.desc()).limit(limit).offset(offset)
    )
    docs = list(result.scalars().all())
    return [_doc_out(d, await _version_count(session, d.id)) for d in docs]


@router.get("/documents/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    doc = await _load_authorized(session, user, document_id)
    return _doc_out(doc, await _version_count(session, doc.id))


@router.get("/documents/{document_id}/versions", response_model=list[VersionOut])
async def list_versions(
    document_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    doc = await _load_authorized(session, user, document_id)
    result = await session.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc.id)
        .order_by(DocumentVersion.version_number.asc())
    )
    return [
        VersionOut(version_number=v.version_number, content_hash=v.content_hash,
                   classification=v.classification, created_at=v.created_at)
        for v in result.scalars().all()
    ]


@router.get("/documents/{document_id}/versions/{version_number}")
async def download_version(
    document_id: UUID,
    version_number: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    plaintext = await service.decrypt_version(session, user, document_id, version_number)
    await session.commit()  # persist the document.view audit event
    return Response(content=plaintext, media_type="application/octet-stream")


@router.get("/documents/{document_id}/versions/{version_number}/verify", response_model=IntegrityOut)
async def verify_version(
    document_id: UUID,
    version_number: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    doc = await _load_authorized(session, user, document_id)
    result = await service.verify_integrity(session, doc.id, version_number)
    await record_event(session, "integrity.verify", actor_id=user.id, object_ref=str(doc.id),
                       payload={"version": version_number, "valid": result["valid"]})
    await session.commit()
    return IntegrityOut(
        valid=result["valid"], hash_ok=result.get("hash_ok"),
        signature_ok=result.get("signature_ok"), content_hash=result.get("content_hash"),
    )


@router.post("/documents/{document_id}/versions", response_model=VersionOut, status_code=201)
async def upload_new_version(
    document_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    content = await _read_upload(file)
    version = await service.add_version(session, user, document_id, content)
    await enqueue_ingestion(session, document_id)
    await session.commit()
    return VersionOut(version_number=version.version_number, content_hash=version.content_hash,
                      classification=version.classification, created_at=version.created_at)


@router.patch("/documents/{document_id}/status", response_model=DocumentOut)
async def change_status(
    document_id: UUID,
    body: StatusChange,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    doc = await service.set_status(session, user, document_id, body.status)
    await session.commit()
    return _doc_out(doc, await _version_count(session, doc.id))


async def _load_authorized(session: AsyncSession, user: User, document_id: UUID) -> Document:
    result = await session.execute(select(Document).where(Document.id == document_id))
    doc = result.scalars().first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await require_case_access(session, user, doc.case_id)
    return doc
