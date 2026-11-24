"""Vector store interface. ChromaDB is the first implementation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class VectorChunk:
    id: str
    document_id: str
    document_name: str
    page_number: int | None
    owner_id: str
    scope: str
    text: str
    chunk_index: int


@dataclass(frozen=True)
class SearchHit:
    chunk_id: str
    document_id: str
    document_name: str
    page_number: int | None
    text: str
    score: float


@runtime_checkable
class VectorStore(Protocol):
    def add(self, document_id: str, chunks: list[VectorChunk], embeddings: list[list[float]]) -> None: ...

    def search(
        self,
        embedding: list[float],
        top_k: int,
        allowed_document_ids: set[str] | None = None,
    ) -> list[SearchHit]: ...

    def delete_document(self, document_id: str) -> None: ...

    def count(self) -> int: ...
