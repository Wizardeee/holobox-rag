"""ChromaDB persistent vector store."""

from __future__ import annotations

import logging

import chromadb

from app.vector_db.base import SearchHit, VectorChunk

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    def __init__(self, path: str, collection_name: str) -> None:
        self._client = chromadb.PersistentClient(path=path)
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add(self, document_id: str, chunks: list[VectorChunk], embeddings: list[list[float]]) -> None:
        if not chunks:
            return
        self._collection.add(
            ids=[chunk.id for chunk in chunks],
            embeddings=embeddings,
            documents=[chunk.text for chunk in chunks],
            metadatas=[
                {
                    "document_id": chunk.document_id,
                    "document_name": chunk.document_name,
                    "page_number": chunk.page_number if chunk.page_number is not None else -1,
                    "owner_id": chunk.owner_id,
                    "scope": chunk.scope,
                    "chunk_index": chunk.chunk_index,
                }
                for chunk in chunks
            ],
        )

    def search(
        self,
        embedding: list[float],
        top_k: int,
        allowed_document_ids: set[str] | None = None,
    ) -> list[SearchHit]:
        if allowed_document_ids is not None and not allowed_document_ids:
            return []
        where = (
            {"document_id": {"$in": sorted(allowed_document_ids)}}
            if allowed_document_ids is not None
            else None
        )
        result = self._collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where,
            include=["metadatas", "documents", "distances"],
        )
        hits: list[SearchHit] = []
        for chunk_id, metadata, text, distance in zip(
            result["ids"][0],
            result["metadatas"][0],
            result["documents"][0],
            result["distances"][0],
        ):
            page = metadata.get("page_number", -1)
            hits.append(
                SearchHit(
                    chunk_id=chunk_id,
                    document_id=metadata["document_id"],
                    document_name=metadata["document_name"],
                    page_number=page if page and page >= 0 else None,
                    text=text,
                    score=max(0.0, 1.0 - float(distance)),
                )
            )
        return hits

    def delete_document(self, document_id: str) -> None:
        self._collection.delete(where={"document_id": document_id})

    def count(self) -> int:
        return self._collection.count()
