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
        """Embed and index all chunks. Returns the number actually written.

        Raises on any mismatch so callers never mark a document READY unless
        every chunk has a vector in the persistent store.
        """
        document = self.repository.get_document(document_id)
        if document is None:
            raise ValueError(f"Document {document_id} not found")

        chunks = self.repository.get_chunks(document_id)
        logger.info(
            "document_pipeline document_id=%s course_id=%s stage=indexing chunks=%s",
            document_id,
            document.course_id,
            len(chunks),
        )
        # Clear first so re-indexing is idempotent and cannot leave stale vectors.
        self.vector_store.delete_document(document_id)
        if not chunks:
            raise ValueError(f"Document {document_id} has no chunks to index")

        texts = [chunk["text"] for chunk in chunks]
        vectors = self.embedder.embed(texts)
        if len(vectors) != len(chunks):
            raise RuntimeError(
                f"Embedding count mismatch for {document_id}: {len(vectors)} vectors for {len(chunks)} chunks"
            )
        if not vectors or not vectors[0]:
            raise RuntimeError(f"Embeddings are empty for {document_id}")
        dimension = len(vectors[0])
        if any(len(vector) != dimension for vector in vectors):
            raise RuntimeError(f"Inconsistent embedding dimensions for {document_id}")

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
                    course_id=document.course_id,
                    subject_id=document.subject_id,
                    approved=document.approved,
                )
                for chunk in chunks
            ],
            vectors,
        )
        self.repository.update_document(document_id, indexed_chunks=len(chunks))
        logger.info(
            "document_pipeline document_id=%s course_id=%s stage=indexed chunks=%s vectors=%s dim=%s",
            document_id,
            document.course_id,
            len(chunks),
            len(vectors),
            dimension,
        )
        return len(chunks)
