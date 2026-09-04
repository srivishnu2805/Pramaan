"""Envelope encryption for document content.

Flow: fresh 256-bit DEK -> AES-256-GCM(document) -> ciphertext; DEK -> KMS wrap
-> wrapped DEK. No plaintext master key or DEK is stored in PostgreSQL.

Every encrypt() call draws a fresh DEK and a fresh 12-byte random nonce, so
nonces are never reused with a given key.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from pramaan.security.kms import KMSBackend


def new_dek() -> bytes:
    """Return a fresh 256-bit Data Encryption Key."""
    return os.urandom(32)


@dataclass(frozen=True)
class EncryptedPayload:
    ciphertext: bytes
    nonce: bytes
    wrapped_dek: bytes
    kms_key_id: str


def _encrypt_with_dek(dek: bytes, plaintext: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    ciphertext = AESGCM(dek).encrypt(nonce, plaintext, None)
    return nonce, ciphertext


def envelope_encrypt(kms: KMSBackend, plaintext: bytes) -> EncryptedPayload:
    # Fresh DEK per encryption => a different key + nonce every time.
    dek = new_dek()
    nonce, ciphertext = _encrypt_with_dek(dek, plaintext)
    wrapped = kms.wrap(dek)

    # Sensitive material (DEK) is never returned to or stored by the caller.
    return EncryptedPayload(
        ciphertext=ciphertext,
        nonce=nonce,
        wrapped_dek=wrapped.wrapped_dek,
        kms_key_id=wrapped.key_id,
    )


def envelope_decrypt(kms: KMSBackend, payload: EncryptedPayload) -> bytes:
    dek = kms.unwrap(payload.kms_key_id, payload.wrapped_dek)
    return AESGCM(dek).decrypt(payload.nonce, payload.ciphertext, None)
