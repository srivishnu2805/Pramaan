"""SHA-256 integrity hashing and canonical document-version manifests.

Integrity (SHA-256) answers "did the bytes change?". It does NOT answer "who
wrote them?" — authenticity requires a digital signature (see signing.py).
"""

from __future__ import annotations

import hashlib
import json
from uuid import UUID


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def canonical_manifest(
    document_id: UUID,
    version_number: int,
    content_hash: str,
    metadata_hash: str,
    created_by: UUID,
    created_at_iso: str,
    classification: str,
) -> bytes:
    """Canonical JSON manifest for a document version.

    json.dumps with sort_keys=True and compact separators gives a stable byte
    representation so the signature over it is deterministic. Changing any
    signed field invalidates verification.
    """
    manifest = {
        "document_id": str(document_id),
        "version": version_number,
        "content_hash": content_hash,
        "metadata_hash": metadata_hash,
        "created_by": str(created_by),
        "created_at": created_at_iso,
        "classification": classification,
    }
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
