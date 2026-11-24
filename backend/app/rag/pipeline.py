"""Retrieval-augmented answer orchestration."""

from __future__ import annotations

import logging
from uuid import uuid4

from app.core.config import Settings
from app.llm.base import LLMProvider, LLMResponse
from app.models.schemas import (
    GenerationMode,
    QueryRequest,
    QueryResponse,
    SourceReference,
)
from app.rag.prompts import build_prompt
from app.retrieval.retriever import Retriever
from app.services.repository import Repository

logger = logging.getLogger(__name__)

NO_CONTEXT_ANSWER = "I don't have enough information in the uploaded documents to answer that question."


class RAGPipeline:
    def __init__(
        self,
        retriever: Retriever,
        llm_provider: LLMProvider,
        repository: Repository,
        settings: Settings,
    ) -> None:
        self.retriever = retriever
        self.llm_provider = llm_provider
        self.repository = repository
        self.settings = settings

    def run(self, request: QueryRequest) -> QueryResponse:
        hits = self.retriever.retrieve(request.question, request.owner_id, request.top_k)
        sources = [
            SourceReference(
                document_id=hit.document_id,
                document_name=hit.document_name,
                page_number=hit.page_number,
                excerpt=hit.text,
                score=hit.score,
            )
            for hit in hits
        ] if request.include_sources else []

        if not hits:
            self._persist(request, NO_CONTEXT_ANSWER, [])
            return QueryResponse(
                answer=NO_CONTEXT_ANSWER,
                sources=sources,
                generation_mode=self.llm_provider.mode,
                conversation_id=request.conversation_id,
                retrieved_context_available=False,
                warning="no_relevant_context",
            )

        try:
            response: LLMResponse = self.llm_provider.generate(
                build_prompt(request.question, hits),
                timeout=self.settings.llm_timeout_seconds,
            )
        except Exception as exc:
            logger.warning("LLM generation failed: %s", exc)
            response = LLMResponse(
                text="Answer generation is currently unavailable. Relevant document excerpts are still shown below.",
                mode=GenerationMode.UNAVAILABLE,
                warning="generation_failed",
            )

        self._persist(request, response.text, [source.model_dump(mode="json") for source in sources])
        return QueryResponse(
            answer=response.text,
            sources=sources,
            generation_mode=response.mode,
            conversation_id=request.conversation_id,
            retrieved_context_available=True,
            warning=response.warning,
        )

    def _persist(self, request: QueryRequest, answer: str, sources: list[dict]) -> None:
        if not request.conversation_id:
            return
        conversation = self.repository.get_conversation(request.conversation_id)
        if conversation is None:
            self.repository.create_conversation(
                request.conversation_id, request.owner_id, request.question[:80]
            )
        elif conversation["owner_id"] != request.owner_id:
            logger.warning("Refusing to write to conversation owned by another user")
            return
        self.repository.add_message(request.conversation_id, uuid4().hex, "user", request.question, [])
        self.repository.add_message(request.conversation_id, uuid4().hex, "assistant", answer, sources)
