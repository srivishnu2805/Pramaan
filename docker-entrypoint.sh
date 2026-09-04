#!/bin/sh
set -e

export PYTHONPATH=/app/src

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head

echo "[entrypoint] Seeding demo users (idempotent)..."
python scripts/seed.py

echo "[entrypoint] Starting uvicorn..."
exec uvicorn pramaan.main:app --app-dir src --host 0.0.0.0 --port 8000