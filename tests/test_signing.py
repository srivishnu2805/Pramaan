from __future__ import annotations

import json
import uuid

import pytest

from pramaan.security.hashing import canonical_manifest, sha256_bytes
from pramaan.security.signing import DevSignatureProvider, SignatureProvider


def test_sha256_known_vector():
    assert sha256_bytes(b"") == ("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")


def test_manifest_is_canonical():
    m1 = canonical_manifest(
        uuid.UUID(int=1), 1, "hash-a", "hash-b", uuid.UUID(int=2), "2026-01-01T00:00:00Z", "SECRET"
    )
    m2 = canonical_manifest(
        uuid.UUID(int=1), 1, "hash-a", "hash-b", uuid.UUID(int=2), "2026-01-01T00:00:00Z", "SECRET"
    )
    assert m1 == m2
    assert json.loads(m1)["version"] == 1


@pytest.fixture
def provider() -> DevSignatureProvider:
    return DevSignatureProvider.generate()


def test_provider_implements_protocol(provider: DevSignatureProvider):
    assert isinstance(provider, SignatureProvider)


def test_sign_verify_roundtrip(provider: DevSignatureProvider):
    manifest = b'{"document": "abc"}'
    sig = provider.sign(manifest)
    assert provider.verify(manifest, sig)


def test_tampered_manifest_rejected(provider: DevSignatureProvider):
    manifest = b'{"document": "abc"}'
    sig = provider.sign(manifest)
    assert not provider.verify(manifest + b" ", sig)


def test_tampered_signature_rejected(provider: DevSignatureProvider):
    manifest = b'{"document": "abc"}'
    sig = provider.sign(manifest)
    bad = bytearray(sig)
    bad[0] ^= 0x01
    assert not provider.verify(manifest, bytes(bad))


def test_wrong_manifest_field_invalidates_signature(provider: DevSignatureProvider):
    doc = uuid.uuid4()
    m1 = canonical_manifest(
        doc, 1, "c-hash", "m-hash", uuid.uuid4(), "2026-01-01T00:00:00Z", "SECRET"
    )
    m2 = canonical_manifest(
        doc, 2, "c-hash", "m-hash", uuid.uuid4(), "2026-01-01T00:00:00Z", "SECRET"
    )
    sig = provider.sign(m1)
    assert not provider.verify(m2, sig)
