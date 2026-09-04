"""Seed demo users for local SIH demonstrations.

Usage: uv run python scripts/seed.py

Creates (idempotent):
  admin / admin123        (role=admin, TOP SECRET)
  investigator / inv12345 (role=investigator, SECRET)
  analyst / analyst123    (role=viewer, CONFIDENTIAL)
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from pramaan.auth.core import hash_password
from pramaan.db import AsyncSessionLocal
from pramaan.models import User

SEEDS = [
    ("admin", "admin123", "Administrator", "admin", None, "TOP SECRET"),
    ("investigator", "inv12345", "Case Investigator", "investigator", "Cyber Cell", "SECRET"),
    ("analyst", "analyst123", "Case Analyst", "viewer", "Records", "CONFIDENTIAL"),
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        for username, password, full_name, role, dept, clearance in SEEDS:
            existing = await session.execute(select(User).where(User.username == username))
            if existing.scalars().first():
                print(f"exists: {username}")
                continue
            session.add(
                User(
                    username=username,
                    hashed_password=hash_password(password),
                    full_name=full_name,
                    role=role,
                    department=dept,
                    clearance=clearance,
                )
            )
            print(f"created: {username}")
        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
