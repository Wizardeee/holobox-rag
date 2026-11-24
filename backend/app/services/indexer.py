"""Bridges stored text chunks to the embedding and vector-store interfaces."""

from __future__ import annotations

import logging

from app.embeddings.base import EmbeddingProvider
from app.services.repository import Repository
from app.vector_db.base import VectorChunk, VectorStore

logger = logging.getLogger(__name__)


class Indexer:
    def __init__(
        self,
        repository: Repository,
        embedder: EmbeddingProvider,
        vector_store: VectorStore,
    ) -> None:
        self.repository = repository
        self.embedder = embedder
        self.vector_store = vector_store

    def index_document(self, document_id: str) -> int:
        document = self.repository.get_document(document_id)
        if document is None:
            return 0
        chunks = self.repository.get_chunks(document_id)
        # Clear first so re-indexing is idempotent.
        self.vector_store.delete_document(document_id)
        if not chunks:
            return 0
        vectors = self.embedder.embed([chunk["text"] for chunk in chunks])
        self.vector_store.add(
            document_id,
            [
                VectorChunk(
                    id=chunk["id"],
                    document_id=document_id,
                    document_name=document.name,
                    page_number=chunk["page_number"],
                    owner_id=document.owner_id,
                    scope=document.scope.value,
                    text=chunk["text"],
                    chunk_index=chunk["chunk_index"],
                )
                for chunk in chunks
            ],
            vectors,
        )
        logger.debug("Indexed %s chunks for document %s", len(chunks), document_id)
        return len(chunks)
