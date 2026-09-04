"""KMS (key-management service) abstraction.

Backends wrap/unwrap Data Encryption Keys (DEKs). The application never stores
a plaintext master key; it stores the *wrapped* DEK plus a key id/version.
"""

from __future__ import annotations

import os
from typing import Protocol, runtime_checkable

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class WrappedKey:
    """A DEK wrapped by the KMS, safe to store in PostgreSQL."""

    __slots__ = ("key_id", "wrapped_dek")

    def __init__(self, key_id: str, wrapped_dek: bytes) -> None:
        self.key_id = key_id
        self.wrapped_dek = wrapped_dek


@runtime_checkable
class KMSBackend(Protocol):
    """Wrap/unwrap a DEK. Never expose raw DEKs to callers except on unwrap."""

    def wrap(self, dek: bytes) -> WrappedKey: ...
    def unwrap(self, key_id: str, wrapped_dek: bytes) -> bytes: ...


class DevKMSBackend:
    """Development-only KMS: AES-256-GCM wrap with a local root key.

    NOT a production KMS. A production backend (e.g. AWS KMS, Azure Key Vault,
    HSM) must implement the same wrap/unwrap contract without ever storing the
    root/master key in PostgreSQL. The root key here comes from
    ``PRAMAAN_KMS_ROOT_KEY_HEX`` and is marked dev-only in config/docs.
    """

    _version = "1"

    def __init__(self, root_key: bytes) -> None:
        if len(root_key) not in (32, 16, 24):
            raise ValueError("root_key must be a valid AES key length (16/24/32 bytes)")
        self._cipher = AESGCM(root_key)

    @property
    def key_id(self) -> str:
        return f"dev-kms-v{self._version}"

    def wrap(self, dek: bytes) -> WrappedKey:
        nonce = os.urandom(12)
        wrapped = self._cipher.encrypt(nonce, dek, None)
        # Format: [key_version:1][nonce:12][ciphertext...]
        return WrappedKey(
            key_id=self.key_id,
            wrapped_dek=bytes([int(self._version)]) + nonce + wrapped,
        )

    def unwrap(self, key_id: str, wrapped_dek: bytes) -> bytes:
        if key_id != self.key_id:
            raise ValueError(f"unknown key {key_id!r}; backend serves {self.key_id!r}")
        version = wrapped_dek[0]
        if str(version) != self._version:
            raise ValueError(f"unsupported wrapped key version {version}")
        nonce = wrapped_dek[1:13]
        ciphertext = wrapped_dek[13:]
        return self._cipher.decrypt(nonce, ciphertext, None)
