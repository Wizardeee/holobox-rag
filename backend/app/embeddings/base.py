"""Embedding provider interface. Independent of LLMs and vector databases."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    model_name: str
    dimension: int

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one normalized vector per input text, in the same order."""
        ...
