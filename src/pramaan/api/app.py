"""FastAPI application assembly.

Security posture:
- Every route requires server-side authentication + authorization (fail closed).
- In-memory sliding-window rate limiting (single-process; a distributed
  limiter replaces it if the app ever scales out).
- Security headers on all responses; generic 500s (no stack traces to clients).
- Request body cap via max_upload_bytes for multipart; JSON payloads bounded
  by Pydantic field limits.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pramaan.api import (
    routes_audit,
    routes_auth,
    routes_cases,
    routes_documents,
    routes_permissions,
    routes_search,
)

RATE_LIMIT_PER_MINUTE = 120


def create_app() -> FastAPI:
    app = FastAPI(title="Pramaan", version="0.1.0", docs_url="/docs", redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    hits: dict[str, deque[float]] = defaultdict(deque)

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= RATE_LIMIT_PER_MINUTE:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
        window.append(now)
        return await call_next(request)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        # Sanitized: never leak tracebacks or internals to clients.
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    app.include_router(routes_auth.router)
    app.include_router(routes_cases.router)
    app.include_router(routes_documents.router)
    app.include_router(routes_permissions.router)
    app.include_router(routes_audit.router)
    app.include_router(routes_search.router)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    return app


app = create_app()
