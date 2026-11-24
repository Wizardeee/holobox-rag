from app.core.config import Settings
from app.models.schemas import QueryRequest
from app.rag.pipeline import NO_CONTEXT_ANSWER, RAGPipeline
from app.services.repository import Repository
from app.vector_db.base import SearchHit
from tests.fakes import FakeEmbedder, FakeLLMProvider, FakeVectorStore


class StubRetriever:
    def __init__(self, hits):
        self.hits = hits

    def retrieve(self, question, owner_id, top_k=None):
        return self.hits


def _pipeline(tmp_path, provider, hits):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    settings = Settings(data_dir=tmp_path / "data")
    return RAGPipeline(StubRetriever(hits), provider, repository, settings), repository


def test_no_context_never_calls_llm(tmp_path):
    provider = FakeLLMProvider()
    pipeline, _ = _pipeline(tmp_path, provider, [])
    response = pipeline.run(QueryRequest(question="unrelated question"))
    assert response.answer == NO_CONTEXT_ANSWER
    assert response.retrieved_context_available is False
    assert response.warning == "no_relevant_context"
    assert provider.calls == []


def test_context_produces_cited_answer(tmp_path):
    hits = [
        SearchHit("c1", "d1", "handbook.pdf", 7, "The library opens at 8am.", 0.9),
    ]
    provider = FakeLLMProvider(response="The library opens at 8am [1].")
    pipeline, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="When does the library open?"))
    assert response.answer == "The library opens at 8am [1]."
    assert response.sources[0].page_number == 7
    assert response.sources[0].document_name == "handbook.pdf"
    assert response.generation_mode.value == "mock"
    assert "handbook.pdf" in provider.calls[0]


def test_llm_failure_degrades_gracefully(tmp_path):
    hits = [SearchHit("c1", "d1", "a.txt", None, "context text", 0.8)]
    provider = FakeLLMProvider(error=RuntimeError("timeout"))
    pipeline, _ = _pipeline(tmp_path, provider, hits)
    response = pipeline.run(QueryRequest(question="question"))
    assert response.warning == "generation_failed"
    assert response.generation_mode.value == "unavailable"
    assert response.sources


def test_conversation_persistence(tmp_path):
    hits = [SearchHit("c1", "d1", "a.txt", None, "context", 0.8)]
    provider = FakeLLMProvider()
    pipeline, repository = _pipeline(tmp_path, provider, hits)
    pipeline.run(QueryRequest(question="first question", conversation_id="conv1", owner_id="alice"))
    pipeline.run(QueryRequest(question="second question", conversation_id="conv1", owner_id="alice"))
    conversation = repository.get_conversation("conv1")
    assert [message.role for message in conversation["messages"]] == [
        "user", "assistant", "user", "assistant"
    ]
    assert conversation["messages"][1].sources
