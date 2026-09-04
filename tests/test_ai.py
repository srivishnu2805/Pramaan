from __future__ import annotations

import pytest

from pramaan.config import Settings
from pramaan.services.ai import (
    DevEmbeddingProvider,
    DevLLMProvider,
    EmbeddingProvider,
    LLMProvider,
    get_embedding_provider,
    get_llm_provider,
)


def _dev_settings(**kw) -> Settings:
    base = dict(
        database_url="postgresql+asyncpg://x",
        jwt_secret="s",
        kms_root_key_hex="00" * 32,
        allow_external_ai=False,
    )
    base.update(kw)
    return Settings(**base)


def test_dev_embedding_deterministic_and_sized():
    provider = DevEmbeddingProvider(dim=384)
    assert isinstance(provider, EmbeddingProvider)
    a = provider.embed(["the quick brown fox"])[0]
    b = provider.embed(["the quick brown fox"])[0]
    assert len(a) == 384
    assert a == b


def test_dev_embedding_similar_texts_closer():
    provider = DevEmbeddingProvider(dim=384)
    anchor, close, far = provider.embed(
        [
            "burglary suspect entered through window",
            "suspect entered through window at night",
            "quantum field theory",
        ]
    )
    import math

    def dist(x, y):
        return math.sqrt(sum((p - q) ** 2 for p, q in zip(x, y, strict=True)))

    assert dist(anchor, close) < dist(anchor, far)


def test_dev_llm_never_fabricates_without_evidence():
    llm = DevLLMProvider()
    assert isinstance(llm, LLMProvider)
    answer = llm.complete("You are a helpful assistant.", "What is the secret code?")
    assert "insufficient evidence" in answer.lower()


def test_factories_return_dev_when_external_disabled():
    settings = _dev_settings()
    assert isinstance(get_embedding_provider(settings), DevEmbeddingProvider)
    assert isinstance(get_llm_provider(settings), DevLLMProvider)


def test_external_ai_requires_explicit_opt_in():
    settings = _dev_settings(allow_external_ai=True)  # no API key set
    with pytest.raises(RuntimeError):
        get_llm_provider(settings)


def test_protocols_are_structural():
    assert isinstance(DevLLMProvider(), LLMProvider)
    assert isinstance(DevEmbeddingProvider(), EmbeddingProvider)
