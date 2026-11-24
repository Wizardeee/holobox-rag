"""Provider-independent LLM interface shared by the RAG pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from app.models.schemas import GenerationMode


@dataclass(frozen=True)
class LLMResponse:
    text: str
    mode: GenerationMode
    warning: str | None = None


@runtime_checkable
class LLMProvider(Protocol):
    id: str
    mode: GenerationMode
    is_configured: bool
    supports_streaming: bool

    def generate(self, prompt: str, *, timeout: float | None = None) -> LLMResponse:
        """Generate an answer from a fully constructed prompt."""
        ...
