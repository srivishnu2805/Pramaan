"""Provider-independent AI interfaces.

LLM, embedding, reranker, OCR, and extraction are all Protocols. Dev
implementations are deterministic and clearly marked. Real external providers
(OpenAI SDK) are gated behind ALLOW_EXTERNAL_AI + API key and are NEVER used
unless explicitly enabled — sensitive documents must not auto-send to public
AI APIs.

Prompt-injection note: these providers see only data already inside the
authorized retrieval scope. Content is delimited as untrusted data at the RAG
layer (search.py), not trusted here.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol, runtime_checkable

from pramaan.config import Settings

_WORD = re.compile(r"[a-z0-9]+")


@runtime_checkable
class LLMProvider(Protocol):
    def complete(self, system: str, user: str) -> str: ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


@runtime_checkable
class Reranker(Protocol):
    def rerank(self, query: str, passages: list[str]) -> list[int]: ...


@runtime_checkable
class OCRProvider(Protocol):
    def extract_text(self, image_bytes: bytes) -> str: ...


@runtime_checkable
class DocumentExtractor(Protocol):
    def extract(self, content: bytes, mime_hint: str = "") -> list[tuple[int | None, str]]: ...


class DevLLMProvider:
    """Deterministic dev LLM. Returns 'insufficient evidence' unless the prompt
    context clearly contains answer-bearing sentences; it never invents facts.

    DEV-ONLY. Production path: approved private/on-prem model behind this interface.
    """

    def complete(self, system: str, user: str) -> str:
        # Very small heuristic: if the user message carries a CONTEXT block with
        # non-trivial content, echo a grounded summary; otherwise decline.
        if "CONTEXT:" in user:
            context = user.split("CONTEXT:", 1)[1].split("QUESTION:", 1)[0].strip()
            if len(context) > 40:
                first = context.split("\n")[0].strip()[:400]
                return (
                    "Based on the retrieved case material: " + first + " "
                    "(See citations for the full sources.)"
                )
        return "Insufficient evidence in the authorized retrieval scope to answer."


class DevEmbeddingProvider:
    """Deterministic hashing-based embeddings (dev only).

    Bag-of-words hashed into `dim` buckets, L2-normalized. Similar texts that
    share words rank closer; unrelated texts rank farther. Crude but real, and
    sufficient for authorization-scoped retrieval demos. Production path: a
    vetted embedding model via the same interface.
    """

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for word in _WORD.findall(text.lower()):
            bucket = int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], "big") % self.dim
            vec[bucket] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class DevReranker:
    """Word-overlap reranker (dev only). Returns passage indices best-first."""

    def rerank(self, query: str, passages: list[str]) -> list[int]:
        query_words = set(_WORD.findall(query.lower()))
        scored = []
        for i, passage in enumerate(passages):
            overlap = len(query_words & set(_WORD.findall(passage.lower())))
            scored.append((-overlap, i))
        scored.sort()
        return [i for _, i in scored]


class UnavailableOCRProvider:
    """OCR is an explicit abstraction with NO dev extraction (PyMuPDF is not OCR).

    Raises so callers handle missing OCR explicitly instead of silently
    pretending text extraction covered scanned pages.
    """

    def extract_text(self, image_bytes: bytes) -> str:
        raise RuntimeError("OCR provider not configured (dev default: none)")


class PyMuPDFExtractor:
    """Text extraction for digital PDFs via PyMuPDF. NOT OCR (see OCRProvider)."""

    def extract(self, content: bytes, mime_hint: str = "") -> list[tuple[int | None, str]]:
        import fitz

        try:
            doc = fitz.open(stream=content, filetype="pdf")
        except Exception as exc:
            raise ValueError(f"PDF parsing failed: {exc}") from exc
        pages: list[tuple[int | None, str]] = []
        try:
            for i, page in enumerate(doc, start=1):
                text_value: str = str(page.get_text())
                pages.append((i, text_value))
        finally:
            doc.close()
        return pages


class OpenAIEmbeddingProvider:
    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        if not settings.openai_api_key:
            raise RuntimeError("PRAMAAN_OPENAI_API_KEY is required for external embeddings")
        self.dim = settings.embedding_dim
        self._client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
        self._model = settings.embedding_model

    def embed(self, texts: list[str]) -> list[list[float]]:
        response = self._client.embeddings.create(model=self._model, input=texts)
        return [list(item.embedding) for item in response.data]


class OpenAILLMProvider:
    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        if not settings.openai_api_key:
            raise RuntimeError("PRAMAAN_OPENAI_API_KEY is required for external LLM")
        self._client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
        self._model = settings.llm_model

    def complete(self, system: str, user: str) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content or ""


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.allow_external_ai:
        return OpenAIEmbeddingProvider(settings)
    return DevEmbeddingProvider(dim=settings.embedding_dim)


def get_llm_provider(settings: Settings) -> LLMProvider:
    if settings.allow_external_ai:
        return OpenAILLMProvider(settings)
    return DevLLMProvider()


def get_reranker(settings: Settings) -> Reranker:
    return DevReranker()


def get_ocr_provider(settings: Settings) -> OCRProvider:
    return UnavailableOCRProvider()


def get_extractor(settings: Settings) -> DocumentExtractor:
    return PyMuPDFExtractor()
