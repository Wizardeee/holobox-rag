from types import SimpleNamespace

from app.core.config import Settings
from app.models.schemas import QueryRequest
from app.rag.pipeline import RAGPipeline
from app.services.repository import Repository
from app.vector_db.base import SearchHit
from tests.fakes import FakeLLMProvider


class StubRetriever:
    def __init__(self, hits, error=None):
        self.hits = hits
        self.error = error
        self.kwargs = None
        self.calls = 0

    def retrieve(self, question, owner_id, top_k=None, **kwargs):
        self.kwargs = kwargs
        self.calls += 1
        if self.error:
            raise self.error
        return self.hits


def _pipeline(tmp_path, provider, hits, retrieval_error=None):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    retriever = StubRetriever(hits, error=retrieval_error)
    settings = Settings(data_dir=tmp_path / "data")
    return RAGPipeline(retriever, provider, repository, settings), repository, retriever


def test_no_context_falls_back_to_general_knowledge(tmp_path):
    provider = FakeLLMProvider(response="Paris is the capital of France.")
    pipeline, _, _ = _pipeline(tmp_path, provider, [])
    response = pipeline.run(QueryRequest(question="What is the capital of France?"))
    assert "Paris" in response.answer
    assert response.retrieved_context_available is False
    assert response.answer_source.value == "general_knowledge"
    assert response.document_support.value == "none"
    assert response.sources == []
    assert len(provider.calls) == 1


def test_context_produces_cited_answer(tmp_path):
    hits = [
        SearchHit("c1", "d1", "handbook.pdf", 7, "The library opens at 8am.", 0.9),
    ]
    provider = FakeLLMProvider(response="The library opens at 8am [1].")
    pipeline, _, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="When does the library open?"))
    assert response.answer == "The library opens at 8am [1]."
    assert response.sources[0].page_number == 7
    assert response.sources[0].document_name == "handbook.pdf"
    assert response.answer_source.value == "documents"
    assert response.document_support.value == "full"
    assert response.generation_mode.value == "mock"
    assert "handbook.pdf" in provider.calls[0]


def test_irrelevant_retrieval_does_not_become_evidence(tmp_path):
    hits = [SearchHit("c1", "d1", "notes.pdf", 3, "A loosely related sentence.", 0.3)]
    provider = FakeLLMProvider(response="The answer comes from general knowledge.")
    pipeline, _, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="unrelated question"))
    assert response.retrieved_context_available is True
    assert response.sources == []
    assert response.answer_source.value == "general_knowledge"
    assert response.document_support.value == "none"


def test_mixed_answer_uses_tags_and_cites_only_documents(tmp_path):
    hits = [
        SearchHit("c1", "d1", "course.pdf", 1, "A kernel is launched by the host.", 0.9),
        SearchHit("c2", "d2", "other.pdf", 2, "Unused excerpt.", 0.6),
    ]
    provider = FakeLLMProvider(
        response=(
            "source: mixed\nsupport: partial\n"
            "A kernel is launched by the host [1]. For example, a vector addition "
            "maps each index to one thread."
        )
    )
    pipeline, _, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="Explain kernel execution with an example"))
    assert response.answer.startswith("A kernel is launched")
    assert "source: mixed" not in response.answer
    assert "support: partial" not in response.answer
    assert response.answer_source.value == "mixed"
    assert response.document_support.value == "partial"
    assert [source.document_name for source in response.sources] == ["course.pdf"]


def test_fabricated_citations_are_dropped(tmp_path):
    hits = [SearchHit("c1", "d1", "a.txt", None, "context", 0.8)]
    provider = FakeLLMProvider(response="Claim with a made up citation [9] and a real one [1].")
    pipeline, _, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="question"))
    assert len(response.sources) == 1
    assert response.sources[0].document_name == "a.txt"


def test_meta_line_is_stripped_and_classified(tmp_path):
    hits = [SearchHit("c1", "d1", "course.pdf", 1, "Course fact.", 0.9)]
    provider = FakeLLMProvider(
        response="META:mixed;partial\nCourse fact [1] plus a general-knowledge example."
    )
    pipeline, _, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="question"))
    assert response.answer == "Course fact [1] plus a general-knowledge example."
    assert response.answer_source.value == "mixed"
    assert response.document_support.value == "partial"
    assert [source.document_name for source in response.sources] == ["course.pdf"]


def test_uncertain_answer_is_flagged(tmp_path):
    provider = FakeLLMProvider(response="source: unknown\nsupport: uncertain\nI cannot verify that.")
    pipeline, _, _ = _pipeline(tmp_path, provider, [])
    response = pipeline.run(QueryRequest(question="unknowable question"))
    assert response.answer == "I cannot verify that."
    assert response.answer_source.value == "unknown"
    assert response.document_support.value == "uncertain"
    assert response.uncertain is True


def test_llm_failure_degrades_gracefully(tmp_path):
    hits = [SearchHit("c1", "d1", "a.txt", None, "context text", 0.8)]
    provider = FakeLLMProvider(error=RuntimeError("timeout"))
    pipeline, _, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="question"))
    assert response.warning == "generation_failed"
    assert response.generation_mode.value == "unavailable"
    assert response.uncertain is True
    assert response.answer_source.value == "unknown"


def test_greeting_skips_retrieval_and_gets_a_natural_answer(tmp_path):
    provider = FakeLLMProvider(response="META:general_knowledge;none\nHi! Welcome to Holobox.")
    pipeline, _, retriever = _pipeline(tmp_path, provider, [])
    response = pipeline.run(QueryRequest(question="Hi"))
    assert response.answer == "Hi! Welcome to Holobox."
    assert response.answer_source.value == "general_knowledge"
    assert retriever.calls == 0
    assert len(provider.calls) == 1


def test_retrieval_failure_falls_back_to_general_knowledge(tmp_path):
    provider = FakeLLMProvider(response="META:general_knowledge;none\nParis is the capital of France.")
    pipeline, _, retriever = _pipeline(tmp_path, provider, [], retrieval_error=RuntimeError("chroma down"))
    response = pipeline.run(QueryRequest(question="What is the capital of France?"))
    assert "Paris" in response.answer
    assert response.retrieved_context_available is False
    assert response.sources == []
    assert retriever.calls == 1


def test_empty_llm_response_is_not_reported_as_success(tmp_path):
    provider = FakeLLMProvider(response="   ")
    pipeline, _, _ = _pipeline(tmp_path, provider, [])
    response = pipeline.run(QueryRequest(question="Hi"))
    assert response.warning == "empty_llm_response"
    assert response.generation_mode.value == "unavailable"
    assert response.uncertain is True


def test_metadata_only_response_is_not_reported_as_success(tmp_path):
    provider = FakeLLMProvider(response="META:general_knowledge;none")
    pipeline, _, _ = _pipeline(tmp_path, provider, [])
    response = pipeline.run(QueryRequest(question="How are you?"))
    assert response.warning == "empty_llm_response"
    assert response.answer
    assert response.uncertain is True


def test_kiosk_filters_course_and_approval(tmp_path):
    provider = FakeLLMProvider()
    pipeline, _, retriever = _pipeline(tmp_path, provider, [])
    principal = SimpleNamespace(user_id="kiosk-user", role="kiosk")
    pipeline.run(
        QueryRequest(question="question", course_id="gpu-arch"),
        principal=principal,
        course_id="gpu-arch",
    )
    assert retriever.kwargs["course_id"] == "gpu-arch"
    assert retriever.kwargs["approved_only"] is True


def test_conversation_persistence(tmp_path):
    hits = [SearchHit("c1", "d1", "a.txt", None, "context", 0.8)]
    provider = FakeLLMProvider()
    pipeline, repository, _ = _pipeline(tmp_path, provider, hits)
    pipeline.run(QueryRequest(question="first question", conversation_id="conv1", owner_id="alice"))
    pipeline.run(QueryRequest(question="second question", conversation_id="conv1", owner_id="alice"))
    conversation = repository.get_conversation("conv1")
    assert [message.role for message in conversation["messages"]] == [
        "user", "assistant", "user", "assistant"
    ]
    assert conversation["messages"][1].sources
