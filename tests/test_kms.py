from __future__ import annotations

import os

import pytest
from cryptography.exceptions import InvalidTag

from pramaan.security.envelope import (
    EncryptedPayload,
    envelope_decrypt,
    envelope_encrypt,
    new_dek,
)
from pramaan.security.kms import DevKMSBackend


@pytest.fixture
def root_key() -> bytes:
    return os.urandom(32)


@pytest.fixture
def kms(root_key: bytes) -> DevKMSBackend:
    return DevKMSBackend(root_key)


def test_kms_wrap_unwrap_roundtrip(kms: DevKMSBackend):
    dek = os.urandom(32)
    env = kms.wrap(dek)
    assert kms.unwrap(env.key_id, env.wrapped_dek) == dek


def test_kms_tampered_wrapped_key_detected(kms: DevKMSBackend):
    dek = os.urandom(32)
    env = kms.wrap(dek)
    tampered = bytearray(env.wrapped_dek)
    tampered[-1] ^= 0x01
    with pytest.raises(InvalidTag):
        kms.unwrap(env.key_id, bytes(tampered))


def test_envelope_encrypt_decrypt_roundtrip(root_key: bytes, kms: DevKMSBackend):
    plaintext = b"classified investigation notes"
    payload = envelope_encrypt(kms, plaintext)
    assert isinstance(payload, EncryptedPayload)
    assert envelope_decrypt(kms, payload) == plaintext


def test_envelope_uses_ciphertext_not_plaintext(root_key: bytes, kms: DevKMSBackend):
    plaintext = b"do not store me in the clear"
    payload = envelope_encrypt(kms, plaintext)
    assert plaintext not in payload.ciphertext
    assert plaintext not in payload.wrapped_dek


def test_envelope_fresh_nonce_per_encryption(root_key: bytes, kms: DevKMSBackend):
    payload_a = envelope_encrypt(kms, b"same content")
    payload_b = envelope_encrypt(kms, b"same content")
    assert payload_a.nonce != payload_b.nonce


def test_envelope_tampered_ciphertext_detected(root_key: bytes, kms: DevKMSBackend):
    payload = envelope_encrypt(kms, b"integrity matters")
    tampered = payload.__replace__(
        ciphertext=payload.ciphertext[:-1] + bytes([payload.ciphertext[-1] ^ 0xFF])
    )
    with pytest.raises(InvalidTag):
        envelope_decrypt(kms, tampered)


def test_envelope_wrong_key_fails(root_key: bytes):
    kms_a = DevKMSBackend(root_key)
    kms_b = DevKMSBackend(os.urandom(32))
    payload = envelope_encrypt(kms_a, b"secret")
    with pytest.raises(InvalidTag):
        envelope_decrypt(kms_b, payload)


def test_new_dek_is_256bit():
    dek = new_dek()
    assert len(dek) == 32
    assert dek != new_dek()
