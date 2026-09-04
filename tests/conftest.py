from __future__ import annotations

import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from pramaan.config import settings


@pytest_asyncio.fixture
async def session() -> AsyncSession:
    """Each test gets a fresh engine + connection + transaction, all on one loop.

    The transaction is rolled back at teardown so tests never pollute the DB.
    """
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    connection = await engine.connect()
    transaction = await connection.begin()
    sess = AsyncSession(bind=connection, expire_on_commit=False)
    try:
        yield sess
    finally:
        await sess.close()
        await transaction.rollback()
        await connection.close()
        await engine.dispose()
