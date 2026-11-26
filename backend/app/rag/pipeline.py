"""Hybrid answer orchestration: document-first retrieval, general knowledge fallback."""

from __future__ import annotations

import logging
from uuid import uuid4

from app.core.config import Settings
from app.llm.base import LLMProvider, LLMResponse
from app.models.schemas import (
    AnswerSource,
    DocumentSupport,
    GenerationMode,
    QueryRequest,
    QueryResponse,
    SourceReference,
)
from app.rag.prompts import (
    build_conversational_prompt,
    build_prompt,
    cited_numbers,
    is_conversational,
    parse_answer,
)
from app.retrieval.retriever import Retriever
from app.services.repository import Repository

logger = logging.getLogger(__name__)

# Kept for API/test compatibility. It is no longer the default answer: a lack
# of relevant documents now falls back to the LLM's general knowledge.
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

    def run(self, request: QueryRequest, *, principal=None, course_id: str | None = None) -> QueryResponse:
        owner = principal.user_id if principal is not None else request.owner_id
        approved_only = bool(principal is not None and principal.role == "kiosk")
        selected_course = course_id or request.course_id
        conversational = is_conversational(request.question)
        if conversational:
            # Small talk must never depend on ChromaDB or document availability.
            hits = []
        else:
            try:
                hits = self.retriever.retrieve(
                    request.question,
                    owner,
                    request.top_k,
                    course_id=selected_course,
                    subject_id=request.subject_id,
                    approved_only=approved_only,
                )
            except Exception as exc:
                logger.warning("Retrieval failed; continuing with general knowledge: %s", exc)
                hits = []
        candidates = [
            SourceReference(
                document_id=hit.document_id,
                document_name=hit.document_name,
                page_number=hit.page_number,
                excerpt=hit.text,
                score=hit.score,
            )
            for hit in hits
        ]

        course_label = None
        if selected_course:
            course = self.repository.get_course(selected_course)
            course_label = course.get("name") if course else selected_course

        try:
            prompt = (
                build_conversational_prompt(request.question)
                if conversational
                else build_prompt(request.question, hits, course_label)
            )
            response: LLMResponse = self.llm_provider.generate(
                prompt,
                timeout=self.settings.llm_timeout_seconds,
            )
            if not response.text.strip():
                response = LLMResponse(
                    text="The AI model returned an empty response. Please try again.",
                    mode=GenerationMode.UNAVAILABLE,
                    warning="empty_llm_response",
                )
        except Exception as exc:
            logger.warning("LLM generation failed: %s", exc)
            response = LLMResponse(
                text="Answer generation is currently unavailable. Please try again shortly.",
                mode=GenerationMode.UNAVAILABLE,
                warning="generation_failed",
            )

        answer, source_tag, support_tag = parse_answer(response.text)
        if not answer.strip():
            # Some models emit only the metadata line; never return an empty answer.
            response = LLMResponse(
                text="The AI model returned an empty response. Please try again.",
                mode=GenerationMode.UNAVAILABLE,
                warning="empty_llm_response",
            )
            answer, source_tag, support_tag = parse_answer(response.text)
        # Citations come only from excerpts the model actually referenced. A
        # retrieved chunk alone is never treated as supporting evidence.
        cited = [number for number in cited_numbers(answer) if 1 <= number <= len(candidates)]
        cited_sources = [candidates[number - 1] for number in cited] if request.include_sources else []

        answer_source, document_support = self._classify(
            source_tag, support_tag, bool(hits), bool(cited), response.warning
        )
        uncertainty_phrases = (
            "couldn't find", "can't find", "cannot find", "no reliable information",
            "i don't know", "i'm not sure", "not enough information",
        )
        uncertain = (
            answer_source == AnswerSource.UNKNOWN
            or document_support == DocumentSupport.UNCERTAIN
            or response.warning in ("generation_failed", "empty_llm_response")
            or any(phrase in answer.lower() for phrase in uncertainty_phrases)
        )

        self._persist(
            request,
            answer,
            [source.model_dump(mode="json") for source in cited_sources],
            owner=owner,
        )
        return QueryResponse(
            answer=answer,
            sources=cited_sources,
            generation_mode=response.mode,
            conversation_id=request.conversation_id,
            retrieved_context_available=bool(hits),
            warning=response.warning,
            answer_source=answer_source,
            document_support=document_support,
            uncertain=uncertain,
        )

    @staticmethod
    def _classify(
        source_tag: str | None,
        support_tag: str | None,
        has_hits: bool,
        has_citations: bool,
        warning: str | None,
    ) -> tuple[AnswerSource, DocumentSupport]:
        if warning == "generation_failed":
            return AnswerSource.UNKNOWN, DocumentSupport.UNCERTAIN
        source = AnswerSource(source_tag) if source_tag else None
        support = DocumentSupport(support_tag) if support_tag else None
        if source is None:
            # Conservative fallback when the model omits machine metadata.
            source = (
                AnswerSource.DOCUMENTS if has_citations
                else AnswerSource.GENERAL_KNOWLEDGE
            )
        if source == AnswerSource.DOCUMENTS and not has_citations:
            # No excerpt was actually cited — it cannot be document-sourced.
            source = AnswerSource.GENERAL_KNOWLEDGE
        if support is None:
            if not has_hits:
                support = DocumentSupport.NONE
            elif has_citations:
                support = DocumentSupport.FULL
            else:
                # Retrieval returned chunks, but the answer does not rely on them.
                support = DocumentSupport.NONE
        return source, support

    def _persist(self, request: QueryRequest, answer: str, sources: list[dict], *, owner: str) -> None:
        if not request.conversation_id:
            return
        conversation = self.repository.get_conversation(request.conversation_id)
        if conversation is None:
            self.repository.create_conversation(
                request.conversation_id, owner, request.question[:80]
            )
        elif conversation["owner_id"] != owner:
            logger.warning("Refusing to write to conversation owned by another user")
            return
        self.repository.add_message(request.conversation_id, uuid4().hex, "user", request.question, [])
        self.repository.add_message(request.conversation_id, uuid4().hex, "assistant", answer, sources)
