"""Query embedding, scope-filtered semantic retrieval and ranking."""

from __future__ import annotations

from app.core.config import Settings
from app.embeddings.base import EmbeddingProvider
from app.models.schemas import DocumentStatus
from app.services.repository import Repository
from app.vector_db.base import SearchHit, VectorStore


class Retriever:
    def __init__(
        self,
        repository: Repository,
        embedder: EmbeddingProvider,
        vector_store: VectorStore,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.embedder = embedder
        self.vector_store = vector_store
        self.settings = settings

    def retrieve(self, question: str, owner_id: str, top_k: int | None = None) -> list[SearchHit]:
        visible = {
            document.id
            for document in self.repository.list_documents(owner_id)
            if document.status == DocumentStatus.READY
        }
        if not visible:
            return []
        query_vector = self.embedder.embed([question])[0]
        hits = self.vector_store.search(
            query_vector,
            top_k or self.settings.retrieval_top_k,
            allowed_document_ids=visible,
        )
        return [hit for hit in hits if hit.score >= self.settings.retrieval_min_score]
