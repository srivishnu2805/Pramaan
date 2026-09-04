"""Standalone ingestion worker: drains the PostgreSQL job queue.

Usage: uv run python worker.py [--once]

Without --once it loops forever (Ctrl-C to stop). Job state lives in
PostgreSQL, so a killed worker can resume: PENDING jobs are picked up and
PROCESSING/FAILED jobs below MAX_ATTEMPTS are reclaimed.
"""

from __future__ import annotations

import asyncio
import sys

from pramaan.db import AsyncSessionLocal
from pramaan.services.ingestion import process_next_job


async def drain_once() -> int:
    processed = 0
    async with AsyncSessionLocal() as session:
        while await process_next_job(session):
            await session.commit()
            processed += 1
    return processed


async def loop(poll_seconds: float = 2.0) -> None:
    while True:
        count = await drain_once()
        if count == 0:
            await asyncio.sleep(poll_seconds)


if __name__ == "__main__":
    if "--once" in sys.argv:
        print(f"processed {asyncio.run(drain_once())} job(s)")
    else:
        print("ingestion worker running (Ctrl-C to stop)")
        try:
            asyncio.run(loop())
        except KeyboardInterrupt:
            print("stopped")
