from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PRAMAAN_", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://pramaan_admin:secure@localhost:5432/pramaan_db"

    # Auth
    jwt_secret: str = "change-me-in-production-generate-with-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # KMS — DEV ONLY root key (AES-256). Never a production KMS.
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    kms_root_key_hex: str = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

    # Signing — DEV ONLY RSA private key path. Production: HSM-backed.
    signing_private_key_path: str | None = None

    # AI / RAG
    allow_external_ai: bool = False
    embedding_dim: int = 384
    embedding_model: str = "text-embedding-3-small"
    llm_model: str = "gpt-4o-mini"
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    rag_top_k: int = 5

    # Ingestion limits
    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_mime_prefixes: tuple[str, ...] = (
        "application/pdf",
        "text/",
        "application/vnd.openxmlformats",
        "image/",
        "video/",
    )
    chunk_size: int = 1000
    chunk_overlap: int = 120

    # Storage: "postgres" (bytea) — future: object storage behind abstraction
    storage_backend: str = "postgres"


settings = Settings()
