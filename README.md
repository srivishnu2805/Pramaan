# Pramaan

> A Secure, Tamper-Evident and AI-Assisted Digital Document Management System for Legal & Investigative Records

**Smart India Hackathon (SIH)** — MHA / Law Enforcement domain

---

## Architecture

```
React + Vite + TS (port 5173)
      │
      ▼
FastAPI  (OAuth2/JWT auth, server-side authorization, rate limiting) (port 8000)
      │
      ▼
PostgreSQL 17 + pgvector 0.8.6 (port 5432)
  ├── Users / Roles / Clearances
  ├── Cases / Case Permissions
  ├── Documents / Versions (AES-256-GCM encrypted)
  ├── Document Chunks + VECTOR(384) embeddings
  ├── Audit Events (SHA-256 hash chain)
  └── Ingestion Jobs (PG-backed, recoverable)
```

---

## Quick Start (3 commands)

```bash
# 1. Start everything (DB + backend + frontend + worker)
docker compose up -d

# 2. Apply migrations + seed demo users
mise run db-reset
mise run seed

# 3. Open the app
# Frontend: http://localhost:5173
# API docs: http://localhost:8000/docs
```

**Demo accounts:**

| Username | Password | Role | Clearance |
|---|---|---|---|
| `admin` | `admin123` | admin | TOP SECRET |
| `investigator` | `inv12345` | investigator | SECRET |
| `analyst` | `analyst123` | viewer | CONFIDENTIAL |

---

## Project Commands

All via `mise run <task>`:

| Task | Description |
|---|---|
| `mise run db-up` | Start PostgreSQL + pgvector via Docker |
| `mise run db-down` | Stop the database |
| `mise run db-logs` | Tail database logs |
| `mise run db-reset` | Destroy DB data, restart, run migrations |
| `mise run db-upgrade` | Apply Alembic migrations |
| `mise run db-revision -m "msg"` | Generate a new migration |
| `mise run dev` | Start FastAPI backend (port 8000, auto-reload) |
| `mise run web` | Start React frontend (port 5173) |
| `mise run worker` | Run the ingestion worker (drains PG job queue) |
| `mise run seed` | Seed demo users into the database |
| `mise run test` | Run all 73 tests |
| `mise run lint` | Lint backend (ruff) + frontend (deno lint) |
| `mise run check` | Lint + type check + tests |
| `mise run docker-build` | Build all Docker images |
| `mise run docker-up` | Start all services via Docker compose |
| `mise run docker-down` | Stop all services |
| `mise run docker-logs` | Follow all service logs |

---

## Local Development (without Docker)

If you already have PostgreSQL running locally:

```bash
# Install toolchain
mise install

# Install Python dependencies
uv sync

# Copy and configure environment
cp .env.example .env
# Edit .env with your database URL

# Run migrations
mise run db-upgrade

# Seed users
mise run seed

# Start services (3 terminals)
mise run dev    # FastAPI on :8000
mise run web    # Vite on :5173
mise run worker # Ingestion worker
```

---

## Docker Compose (Full Stack)

The project includes a complete `docker-compose.yaml` that defines all services:

```yaml
services:
  db:           # PostgreSQL 17 + pgvector
  backend:      # FastAPI (port 8000)
  frontend:     # Vite dev server (port 5173)
  worker:       # Ingestion worker
```

**Dockerfiles provided:**
- `Dockerfile.backend` - FastAPI backend (uses `ghcr.io/astral-sh/uv:python3.12-alpine`)
- `Dockerfile.frontend` - React frontend (uses `denoland/deno:alpine`)
- `Dockerfile.worker` - Background ingestion worker (uses `ghcr.io/astral-sh/uv:python3.12-alpine`)

```bash
docker compose up -d        # Start all services
docker compose logs -f     # Follow all logs
docker compose down         # Stop everything
docker compose down -v      # Stop + destroy DB data
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
# Database
PRAMAAN_DATABASE_URL=postgresql+asyncpg://pramaan_admin:secure@localhost:5432/pramaan_db

# Auth (generate with: openssl rand -hex 32)
PRAMAAN_JWT_SECRET=<your-secret>

# KMS — DEV ONLY (generate with: openssl rand -hex 32)
# NOT a production KMS. Never store this key in PostgreSQL.
PRAMAAN_KMS_ROOT_KEY_HEX=<your-32-byte-hex-key>

# AI — default OFF; enable only with explicit opt-in
PRAMAAN_ALLOW_EXTERNAL_AI=false
PRAMAAN_OPENAI_API_KEY=
```

---

## Security Properties

| Invariant | Mechanism |
|---|---|
| Encryption at rest | AES-256-GCM envelope encryption; fresh DEK per version; KMS abstraction |
| Document integrity | SHA-256 of stored bytes; verification recomputes hash |
| Document authenticity | RSA-PSS/SHA-256 digital signature over canonical manifest |
| Authorization | RBAC + ABAC (case ownership, permissions, clearance/classification); fail-closed |
| Secure RAG | authz → scope → **constrained** pgvector query → LLM; never filter-after |
| Audit tamper-evidence | SHA-256 hash chain; each event hashes previous |
| Prompt injection | Retrieved content treated as untrusted data; scope enforced in SQL, not LLM |
| Immutable history | Versions are append-only; UNIQUE(document_id, version_number) constraint |

---

## SIH Demo Scenarios

Each scenario has a real (non-mocked) automated test backing it:

| # | Scenario | What to demonstrate |
|---|---|---|
| 1 | **Document integrity** | Upload doc → hash → sign → verify OK. Modify bytes → verify FAILS. |
| 2 | **Immutable version history** | Three versions created; v1/v2 hashes unchanged after v3. |
| 3 | **Authorization isolation** | Alice sees Case A. Bob's Case B invisible and 403-denied. |
| 4 | **Secure RAG no leak** | Launch code in Bob's case only. Alice's RAG query cannot retrieve it. |
| 5 | **Prompt injection** | Malicious instructions in a document cannot exfiltrate other-case data. |
| 6 | **Audit tampering** | Modify one audit event in DB → chain verification fails. |

---

## Key Abstractions

- **KMSBackend** (`src/pramaan/security/kms.py`) — `wrap`/`unwrap` interface; DevKMSBackend uses AES-256-GCM with a local root key. **Not a production KMS.**
- **SignatureProvider** (`src/pramaan/security/signing.py`) — RSA-PSS/SHA-256. DevSignatureProvider holds a local RSA key. **Not HSM-backed.**
- **RetrievalScope** (`src/pramaan/permissions.py`) — Computes authorized `case_ids` + clearance filters. Drives both object queries and the pgvector `WHERE` predicate. LLM never decides authorization.
- **LLMProvider / EmbeddingProvider** (`src/pramaan/services/ai.py`) — Protocol interfaces. Default: `DevLLMProvider` (deterministic, refuses to fabricate), `DevEmbeddingProvider` (hashing-based). Real providers via OpenAI SDK gated by `ALLOW_EXTERNAL_AI=true`.
- **Audit** (`src/pramaan/audit.py`) — SHA-256 hash chain. Tamper-evident, not immutable. Production hardening: anchor checkpoints to append-only storage.
- **Ingestion** (`src/pramaan/services/ingestion.py`) — PG-backed job state machine. No Redis/Celery.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2 async + asyncpg |
| DB | PostgreSQL 17 + pgvector 0.8.6 |
| Crypto | `cryptography` (AES-256-GCM, RSA-PSS) |
| Auth | PyJWT, pwdlib (Argon2) |
| AI | Provider abstraction; OpenAI SDK (opt-in) |
| Frontend | React 19, Vite, TypeScript, Tailwind 4, shadcn/ui |
| Tooling | mise, uv, Deno, ruff, pyright, pytest |
| Deployment | docker-compose (full stack) |

---

## Docs

- [docs/superpowers/plans/](./docs/superpowers/plans/) — Implementation plan
- [docs/architecture.md](./docs/architecture.md) — Architecture reference
- [docs/security.md](./docs/security.md) — Security properties and guarantees
- [docs/threat-model.md](./docs/threat-model.md) — Threat model

---

## No Security Theater

- Encryption is **real** (AES-256-GCM with fresh DEK + nonce per version)
- Signatures are **real** (RSA-PSS over canonical manifest)
- Authorization is **real** (server-side, fail-closed)
- RAG scope enforcement is **real** (SQL constraint, not prompt engineering)
- Audit tampering detection is **real** (hash chain recomputation)
- Every claim above has an automated test proving it

Dev-only components are clearly marked in code and docs. Production paths are documented via abstraction interfaces.
