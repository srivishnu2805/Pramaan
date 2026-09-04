from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: UUID
    username: str
    full_name: str | None = None
    role: str
    department: str | None = None
    clearance: str
    disabled: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    role: str = Field(default="viewer", max_length=64)
    department: str | None = Field(default=None, max_length=128)
    clearance: str = Field(default="UNCLASSIFIED", max_length=32)


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    classification: str = Field(default="UNCLASSIFIED", max_length=32)
    description: str | None = None


class CaseOut(BaseModel):
    id: UUID
    title: str
    classification: str
    description: str | None
    owner_id: UUID
    status: str
    created_at: datetime


class PermissionGrant(BaseModel):
    user_id: UUID
    level: str = Field(pattern="^(VIEW|EDIT|MANAGE)$")


class PermissionOut(BaseModel):
    id: UUID
    case_id: UUID
    user_id: UUID
    level: str


class DocumentOut(BaseModel):
    id: UUID
    case_id: UUID
    title: str
    classification: str
    status: str
    version_count: int = 0
    created_at: datetime


class VersionOut(BaseModel):
    version_number: int
    content_hash: str
    classification: str
    created_at: datetime


class IntegrityOut(BaseModel):
    valid: bool
    hash_ok: bool | None = None
    signature_ok: bool | None = None
    content_hash: str | None = None


class StatusChange(BaseModel):
    status: str = Field(pattern="^(ACTIVE|ARCHIVED|QUARANTINED|DELETED)$")


class RagRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)


class CitationOut(BaseModel):
    document_id: UUID
    version_number: int
    page: int | None
    chunk_index: int
    snippet: str


class RagResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
