# Pramaan — Secure Document Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, tamper-evident, AI-assisted digital document management system for legal/investigative records (SIH), with real (non-faked) security invariants demonstrable end-to-end.

**Architecture:** Single FastAPI app + PostgreSQL (with pgvector) + in-process/recoverable ingestion worker. React/Vite frontend. Envelope encryption, RSA-PSS signatures, audit hash chain, authorization-constrained RAG.

**Tech Stack:** FastAPI, SQLAlchemy 2 async + asyncpg, pydantic-settings, Alembic, PostgreSQL 17 + pgvector 0.8.6, `cryptography`, PyJWT, pwdlib, PyMuPDF, pytest/httpx, structlog, OpenAI SDK (dev provider). Frontend: React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query + Table, Deno tooling.

**Spec:** (design captured in brainstorming; see docs/superpowers/specs if present)

## Global Constraints

- Security → correctness → demonstrability → maintainability → performance → scale.
- Never implement crypto/auth/parsing/hashing ourselves. Use established libs.
- Fail closed: missing/invalid/ambiguous security metadata DENIES.
- Frontend auth is UX only, never a security boundary.
- No Redis/Celery/Kafka/S3/Elasticsearch/K8s/microservices. PostgreSQL-backed jobs only.
- No LangChain/LlamaIndex unless concrete benefit demonstrated (they are excluded).
- Document binaries stored in PostgreSQL `bytea`.
- All doc content AES-256-GCM encrypted at rest; fresh DEK per version; unique nonces.
- No secrets/plaintext master keys in PostgreSQL. Dev KMS uses env root key, clearly marked dev-only.
- Signature over canonical version manifest (RSA-PSS/SHA-256), not raw bytes alone.
- Audit uses SHA-256 hash chain; tamper-evident not immutable; document this.
- Authorization BEFORE vector retrieval. Retrieval-scope abstraction, never filter-after.
- Retrieved content is untrusted data. Prompt-injection protection must not rely solely on system prompt.
- `ALLOW_EXTERNAL_AI=false` default; gated access to public AI for dev only.
- Expensive ingestion async + recoverable (status machine in DB).
- RSA-PSS/SHA-256; SHA-256 integrity; AES-256-GCM encryption.
- Document states: ACTIVE/ARCHIVED/QUARANTINED/DELETED; no destructive CRUD for history.
- Every major security invariant has a real automated test.

---

## File Structure

```
mise.toml                     # runtime/tasks
pyproject.toml                # python deps + tool config
uv.lock                       # lockfile (generated)
src/pramaan/
  __init__.py
  config.py                   # pydantic-settings Settings
  db.py                       # async engine + session factory
  models.py                   # SQLAlchemy models
  security/
    __init__.py
    kms.py                    # KMSBackend abstraction + DevKMSBackend
    envelope.py               # enc/dec helpers
    signing.py                # SignatureProvider + DevSignatureProvider
    hashing.py                # sha256 helpers, manifest canonical form
  audit.py                    # hash-chain audit service + log helper
  auth/
    __init__.py
    core.py                   # JWT create/verify, password hash
    deps.py                   # get_current_user, require_permission (fail closed)
  permissions.py              # RBAC + ABAC resolver, retrieval scope abstraction
  services/
    __init__.py
    cases.py
    documents.py
    ingestion.py              # worker: validate/scan/extract/chunk/embed/index
    search.py                 # secure RAG
    ai.py                     # LLM/Embedding/OCR/Reranker/Extractor abstractions + dev impls
  api/
    __init__.py
    app.py                    # FastAPI app assembly, middleware, error handlers
    routes_auth.py
    routes_cases.py
    routes_documents.py
    routes_permissions.py
    routes_audit.py
    routes_search.py
  main.py                     # entrypoint
  db/
    base.py                   # Base metadata
    env.py                    # alembic env
    versions/                 # migrations
worker.py                     # standalone ingest process runner
tests/
  conftest.py                 # test DB + fixtures
  test_kms.py
  test_signing.py
  test_audit.py
  test_auth.py
  test_authorization.py
  test_versions.py
  test_ingestion.py
  test_rag_security.py
  test_demo_flows.py
web/                          # React frontend
scripts/dev.ps1
```

---

## Tasks

### Task 1: Tooling, config, DB bootstrap

**Files:**
- Create: `mise.toml`, `pyproject.toml`, `src/pramaan/__init__.py`, `src/pramaan/config.py`, `src/pramaan/db.py`, `src/pramaan/models.py`, `src/pramaan/db/base.py`, `src/pramaan/db/env.py`, `alembic.ini`

**Interfaces:**
- Produces: `Settings` (from pydantic-settings), `async_engine`, `async_session`, `Base` (DeclarativeBase), `create_all`-capable metadata, all SQLAlchemy models.
- DB env: `postgresql+asyncpg://pramaan_admin:secure@localhost:5432/pramaan_db`

**Step 1:** Create `mise.toml` with python 3.12 pinned and task defs (dev/test/lint/format/check).

**Step 2:** Create `pyproject.toml` with deps and `[tool.uv]`, `[tool.pytest.ini_options]`, ruff config. Run `uv lock && uv sync`.

**Step 3:** Create `config.py` with `Settings` (DATABASE_URL, JWT_SECRET, KMS_ROOT_KEY_DEV, ALLOW_EXTERNAL_AI, embedding provider settings, doc size limits, etc). Fail-closed defaults.

**Step 4:** Create `db.py` with asyncpg engine + sessionmaker + `get_session` dependency.

**Step 5:** Create `models.py` with all tables:

- `User`: id (uuid, pk), username (unique), hashed_password, full_name, role, department, clearance, disabled, created_at
- `Case`: id (uuid pk), title, description, classification, owner_id (FK), status, created_at
- `CasePermission`: id, case_id (FK), user_id (FK), level (VIEW/EDIT/MANAGE), UNIQUE(case_id,user_id)
- `Document`: id (uuid pk), case_id (FK), title, classification, status (enum ACTIVE/ARCHIVED/QUARANTINED/DELETED), current_version_id (nullable FK), created_by, created_at
- `DocumentVersion`: id (uuid pk), document_id (FK), version_number (int), content (LargeBinary), ciphertext_nonce (LargeBinary), wrapped_dek (LargeBinary), kms_key_id (str), content_hash (str), metadata_hash (str), previous_version_id (nullable FK), created_by (FK user), created_at, classification, signature (LargeBinary), manifest (Text/JSON), UNIQUE(document_id, version_number)
- `Chunk`: id (uuid pk), version_id (FK), document_id (FK), case_id (FK), chunk_index (int), page (int null), content (Text), embedding (vector), created_at
- `AuditEvent`: id (uuid pk), event_type, user_id (null), object_ref (null), payload (JSON/Text), occurred_at (timestamp), prev_hash (str), event_hash (str)
- `IngestionJob`: id (uuid pk), document_id FK, status (PENDING/PROCESSING/READY/QUARANTINED/FAILED), error (Text null), attempts (int), created_at, updated_at

**Step 6:** Write alembic config + env; generate initial migration via `alembic revision --autogenerate`, then `alembic upgrade head`.

**Step 7:** Verify: `alembic upgrade head` against the DB; `test_import` smoke test that models import.

### Task 2: KMS + Envelope Encryption

**Files:**
- Create: `src/pramaan/security/kms.py`, `src/pramaan/security/envelope.py`, `tests/test_kms.py`

**Interfaces:**
- `class KMSBackend(Protocol)`: `wrap(dek: bytes) -> WrappedKey`; `unwrap(key_id: str, wrapped: bytes) -> bytes`
- `DevKMSBackend(root_key: bytes)`: AES-256-GCM wrap with random nonce; key_id derived from key version.
- `envelope_encrypt(backend, plaintext) -> EnvelopeCiphertext(nonce, ciphertext, wrapped_dek, key_id)`
- `envelope_decrypt(backend, nonce, ciphertext, wrapped_dek, key_id) -> plaintext`

**Step 1:** Write failing tests for wrap/unwrap round-trip and tamper detection.

**Step 2:** Implement `kms.py` + `envelope.py`.

**Step 3:** Pass tests. Commit.

### Task 3: Hashing + Signature Provider

**Files:**
- Create: `src/pramaan/security/hashing.py`, `src/pramaan/security/signing.py`, `tests/test_signing.py`

**Interfaces:**
- `sha256_bytes(data: bytes) -> str` (hex)
- `canonical_manifest(document_id, version_number, content_hash, metadata_hash, creator, created_at, classification) -> bytes`
- `class SignatureProvider(Protocol)`: `sign(manifest: bytes) -> bytes`; `verify(manifest: bytes, sig: bytes) -> bool`
- `DevSignatureProvider(private_key: rsa)` RSA-PSS/SHA-256. Production path documented (HSM/COSO).

**Step 1:** Tests: valid sig verifies; manifest change invalidates; different version invalidates.

**Step 2:** Implement.

### Task 4: Audit Hash Chain

**Files:**
- Create: `src/pramaan/audit.py`, `tests/test_audit.py`

**Interfaces:**
- `audit_event(session, event_type, actor_id, object_ref=None, payload=None) -> AuditEvent`
- `verify_chain(session) -> (bool, break_index)` precompute all event_hash from canonical + prev_hash.
- `append` uses SELECT ... FOR UPDATE of last row to prevent races (or transaction).

**Step 1:** Tests: chain verifies; tamper one payload → verify fails; tamper prev_hash → fails; two rapid events produce consistent chain.

**Step 2:** Implement.

### Task 5: Auth (JWT, hashing, dependencies, fail-closed)

**Files:**
- Create: `src/pramaan/auth/core.py`, `src/pramaan/auth/deps.py`, `tests/test_auth.py`

**Interfaces:**
- `hash_password(pw)`, `verify_password(pw, hashed)` via pwdlib Argon2.
- `create_access_token(sub, role, clearance, department, expires)`, `decode_token`.
- `get_current_user` (from OAuth2 bearer, fail-closed: invalid → 401), loads user by id.
- `require_active_user`, `require_permission(*permissions)`.

**Step 1:** Tests: token round-trip; wrong password fails; expired/invalid token rejected; disabled user denied.

### Task 6: Authorization + Retrieval-Scope Abstraction

**Files:**
- Create: `src/pramaan/permissions.py`, `tests/test_authorization.py`

**Interfaces:**
- `can_access_case(session, user, case_id) -> bool` (owner, CasePermission level, or admin role)
- `visible_case_ids(session, user) -> list[uuid]` — the retrieval scope primitive.
- `class RetrievalScope`: holds: user, `case_ids: set`, optional min_clearance, optional status filter. Method `case_filter()` returning a SQLAlchemy expression and/or list usable in vector query.
- `require_case_access(session, user, case_id)` raises 403 if not allowed (fail closed).

**Step 1:** Tests: admin vs investigator vs none; User A cannot access B's case; scope contains only authorized cases; clearance/status apply to scope.

### Task 7: Document Services (upload, versioning, lifecycle)

**Files:**
- Create: `src/pramaan/services/documents.py`, `tests/test_versions.py`

**Interfaces:**
- `create_document(session, user, case_id, title, classification, content: bytes) -> Document` (validates case access, encrypts, hashes, signs manifest, creates v1 + audit)
- `add_version(session, user, document_id, new_content) -> DocumentVersion` (immutability: never mutate existing rows; UNIQUE constraint prevents races)
- `set_status(session, user, document_id, status)` explicit + audited
- `verify_integrity(session, doc_id, version_number) -> dict` (recompute hash, check content_hash; verify signature over manifest)

**Step 1:** Tests (this covers several invariants): modified bytes fail integrity; invalid signature detected; historical version not overwritten (create v2 then v1 unchanged); concurrent version creation cannot produce duplicate version numbers (unique constraint); classification/status gating.

### Task 8: Ingestion Worker (PG-backed, recoverable)

**Files:**
- Create: `src/pramaan/services/ingestion.py`, `worker.py`, `tests/test_ingestion.py`

**Interfaces:**
- `enqueue_ingestion(session, document_id)` creates IngestionJob(PENDING)
- `process_queue(engine, embedding_provider)` loop: claim PENDING→PROCESSING (single attempt w/ lock), validate, scan (dev fallback), extract (PyMuPDF), chunk, embed, index into Chunk; → READY or QUARANTINED/FAILED.
- `run_worker()` recoverable main.
- Guard: size limits, malformed → FAILED, zip-bomb not applicable (no zip but still validate), resource exhaustion via try/except.

**Step 1:** Tests: pdf text extracted → chunks created; oversized rejected; malformed → FAILED; job recoverable (fails then retries to READY).

### Task 9: AI Provider Abstractions + Dev Impls

**Files:**
- Create: `src/pramaan/services/ai.py`, `tests/test_ai.py`

**Interfaces:**
- `class LLMProvider(Protocol)`: `complete(system, user, messages=None) -> str`
- `class EmbeddingProvider(Protocol)`: `embed(texts: list[str]) -> list[list[float]]`
- `class Reranker(Protocol)`: `rerank(query, results) -> ranked`
- `class OCRProvider(Protocol)`, `class DocumentExtractor(Protocol)` — abstraction only; dev default none/placeholder.
- `DevLLMProvider` (returns deterministic canned answer + citations, gated by ALLOW_EXTERNAL_AI=false → uses local/deterministic), `DevEmbeddingProvider` (hashing-based deterministic vectors), `OpenAIProvider` (real, gated).
- `get_providers(settings)` factory.

**Step 1:** Tests: provider factory returns dev impls when ALLOW_EXTERNAL_AI=false; DevEmbeddingProvider deterministic; DevLLMProvider never called when external AI disabled.

### Task 10: Secure RAG + Citations

**Files:**
- Create: `src/pramaan/services/search.py`, `tests/test_rag_security.py`

**Interfaces:**
- `secure_search(session, user, query, top_k) -> RagResult(answer, citations: list[Citation], scope_case_ids)`
- Flow: authenticate → authorize → retrieval scope → authorization-constrained pgvector query (WHERE case_id IN scope_case_ids AND status=ACTIVE AND clearance ok) → rerank → build context with citation metadata → LLM (untrusted content delimited) → answer + citations.
- `RagResult.citations`: each `{document_id, version_number, page, chunk_index, snippet}` — never fabricated; "insufficient evidence" if no scope.

**Step 1:** Tests (critical): 
- Answer to Q placed only in unauthorized case → not retrieved (no leakage).
- Unauthorized chunks never enter context (scope case_ids only).
- Prompt injection in document content cannot cause retrieval/exfiltration of unauthorized data (content is data, scope enforced in SQL).
- Empty scope → "insufficient evidence".

### Task 11: API Routes

**Files:**
- Create: `src/pramaan/api/app.py`, `routes_auth.py`, `routes_cases.py`, `routes_documents.py`, `routes_permissions.py`, `routes_audit.py`, `routes_search.py`, `src/pramaan/main.py`

**Endpoints:**
- POST /auth/token (OAuth2 form) → JWT
- GET /auth/me
- CRUD /cases, /cases/{id} (authz)
- POST /cases/{id}/documents (upload → enqueue ingestion), GET /documents, GET /documents/{id}/versions, GET /documents/{id}/versions/{v}/verify (integrity), POST /documents/{id}/versions (new version), PATCH /documents/{id}/status
- PUT /permissions/cases/{id} (grant/revoke)
- GET /audit (paginated) + GET /audit/verify
- POST /search/rag (secure RAG)
- All endpoints: server-side authz; rate limiting; size limits; sanitized errors.

**Step 1:** Wire mock-free API; integration test each route with auth; ensure fail-closed (`get_current_user` mandatory).

### Task 12: Security Invariant + Demo Flow Tests

**Files:**
- Create: `tests/test_demo_flows.py`; add cross-cutting tests.

**Step 1:** End-to-end: register two users, case A/B, upload doc w/ answer to secret Q in unauthorized case → RAG doesn't reveal; seed prompt injection doc → treated as data; tamper audit event → verify fails; upload→hash→sign→verify → OK; tamper → verify fails; version history immutable. All real.

### Task 13: Frontend

**Files:**
- Create: `web/` React+Vite+TS+Tailwind+shadcn+TanStack scaffold and pages (login, dashboard, cases, documents, versions, integrity verify, permissions, audit verify, secure search + citations, assistant).

**Step 1:** Scaffold Vite app, deps.
**Step 2:** Build pages bound to API. Auth via bearer token. All UX-only.

### Task 14: Docs

**Files:**
- Create: `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/threat-model.md`

**Step 1:** Write docs honestly: implemented vs dev-only vs production-hardening. Threat model covers: compromised user account, malicious insider, malicious uploaded document, prompt injection, database compromise, application compromise, stolen credentials, unauthorized administrator, AI/provider compromise, supply-chain compromise.

### Task 15: Final Review

Run full `pytest`. Lint + format + typecheck. Security & architecture review pass. Fix regressions.
