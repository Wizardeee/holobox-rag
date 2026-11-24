from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.models.schemas import Scope
from tests.fakes import FakeLLMProvider


def _upload(client):
    return client.post(
        "/api/v1/documents",
        files={"file": ("notes.txt", b"cloud computing lecture notes", "text/plain")},
        data={"scope": Scope.USER.value},
        headers={"X-User-Id": "alice"},
    )


def _query(client, question="What is covered?", user="alice", **extra):
    body = {"question": question, "owner_id": user, **extra}
    return client.post("/api/v1/query", json=body, headers={"X-User-Id": user})


def test_query_without_documents_is_honest(client):
    response = _query(client)
    assert response.status_code == 200
    body = response.json()
    assert "don't have enough information" in body["answer"]
    assert body["retrieved_context_available"] is False
    assert body["sources"] == []


def test_query_end_to_end_with_citations(client):
    document = _upload(client).json()
    response = _query(client, "What are the notes about?")
    assert response.status_code == 200
    body = response.json()
    assert body["retrieved_context_available"] is True
    assert body["generation_mode"] == "mock"
    assert body["sources"][0]["document_id"] == document["id"]
    assert body["sources"][0]["document_name"] == "notes.txt"
    assert "excerpt" in body["sources"][0]


def test_query_validation_and_course_validation(client):
    assert client.post("/api/v1/query", json={"question": ""}).status_code == 422
    unknown_course = client.post(
        "/api/v1/query",
        json={"question": "hi", "course_id": "does-not-exist"},
        headers={"X-User-Id": "alice"},
    )
    assert unknown_course.status_code == 404


def test_query_requires_token_when_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_AUTH_ENABLED", "true")
    monkeypatch.setenv("HOLOBOX_API_TOKEN", "secret-token")
    monkeypatch.setenv("HOLOBOX_KIOSK_TOKEN", "secret-token")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        assert client.post("/api/v1/query", json={"question": "hi"}).status_code == 401
        assert client.post(
            "/api/v1/query",
            json={"question": "hi"},
            headers={"Authorization": "Bearer secret-token"},
        ).status_code == 200
    get_settings.cache_clear()


def test_mock_mode_is_reported_not_hidden(client):
    _upload(client)
    body = _query(client).json()
    assert body["generation_mode"] == "mock"
    assert isinstance(client.app.state.llm_provider, FakeLLMProvider)
