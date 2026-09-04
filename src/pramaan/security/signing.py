"""Digital signature providers for document-version manifests.

RSA-PSS / SHA-256 via the `cryptography` library. The manifest (not raw bytes)
is signed so that signed metadata changes also invalidate verification.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


@runtime_checkable
class SignatureProvider(Protocol):
    def sign(self, manifest: bytes) -> bytes: ...
    def verify(self, manifest: bytes, signature: bytes) -> bool: ...


class DevSignatureProvider:
    """Development-only signature provider holding a local RSA private key.

    Production path: HSM-backed signer implementing the same interface (e.g.
    via PKCS#11). The private key must never be stored in PostgreSQL.
    """

    def __init__(self, private_key: rsa.RSAPrivateKey) -> None:
        self._private = private_key
        self._public = private_key.public_key()
        self._padding = padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH,
        )

    @classmethod
    def generate(cls, key_size: int = 2048) -> DevSignatureProvider:
        return cls(rsa.generate_private_key(public_exponent=65537, key_size=key_size))

    @classmethod
    def from_pem(cls, pem: bytes, password: bytes | None = None) -> DevSignatureProvider:
        key = serialization.load_pem_private_key(pem, password=password)
        assert isinstance(key, rsa.RSAPrivateKey)
        return cls(key)

    def public_pem(self) -> bytes:
        return self._public.public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    def sign(self, manifest: bytes) -> bytes:
        return self._private.sign(manifest, self._padding, hashes.SHA256())

    def verify(self, manifest: bytes, signature: bytes) -> bool:
        try:
            self._public.verify(signature, manifest, self._padding, hashes.SHA256())
            return True
        except InvalidSignature:
            return False
