"""Application-wide crypto provider singletons, built from Settings.

DEV-ONLY note: DevKMSBackend and DevSignatureProvider hold local key material.
They implement the production interfaces (KMSBackend.wrap/unwrap,
SignatureProvider.sign/verify) so HSM/KMS backends can replace them without
touching business logic. Never store plaintext master keys in PostgreSQL.
"""

from __future__ import annotations

from functools import lru_cache

from pramaan.config import settings
from pramaan.security.kms import DevKMSBackend, KMSBackend
from pramaan.security.signing import DevSignatureProvider, SignatureProvider


@lru_cache(maxsize=1)
def get_kms() -> KMSBackend:
    # ponytail: lru_cache singleton; real DI container if the app outgrows it
    raw = settings.kms_root_key_hex
    try:
        root_key = bytes.fromhex(raw)
    except ValueError:
        raise RuntimeError("PRAMAAN_KMS_ROOT_KEY_HEX must be hex")
    if len(root_key) != 32:
        raise RuntimeError("PRAMAAN_KMS_ROOT_KEY_HEX must decode to 32 bytes (AES-256)")
    return DevKMSBackend(root_key)


@lru_cache(maxsize=1)
def get_signer() -> SignatureProvider:
    if settings.signing_private_key_path:
        pem = open(settings.signing_private_key_path, "rb").read()
        return DevSignatureProvider.from_pem(pem)
    return DevSignatureProvider.generate()
