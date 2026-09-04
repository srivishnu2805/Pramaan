from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from pramaan.api.schemas import CitationOut, RagRequest, RagResponse
from pramaan.auth.deps import get_current_user
from pramaan.db import get_session
from pramaan.models import User
from pramaan.services.search import secure_search

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/rag", response_model=RagResponse)
async def rag_query(
    body: RagRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await secure_search(session, user, body.query, top_k=body.top_k)
    await session.commit()  # persist the rag.query audit event
    return RagResponse(
        answer=result.answer,
        citations=[
            CitationOut(
                document_id=c.document_id,
                version_number=c.version_number,
                page=c.page,
                chunk_index=c.chunk_index,
                snippet=c.snippet,
            )
            for c in result.citations
        ],
    )
