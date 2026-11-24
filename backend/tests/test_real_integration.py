"""End-to-end text workflow with the real embedder, real ChromaDB and mock LLM.

This is the acceptance test for Stage 7: typed question -> retrieval -> answer
with citations, and honest no-context behaviour for unrelated questions.
"""

from fastapi.testclient import TestClient

import app.main as main_module
from app.core.config import get_settings
from app.llm.mock import LABEL


def test_typed_question_end_to_end_with_real_components(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_LLM_PROVIDER", "mock")
    monkeypatch.delenv("HOLOBOX_API_TOKEN", raising=False)
    get_settings.cache_clear()
    app = main_module.create_app()

    with TestClient(app) as client:
        uploaded = client.post(
            "/api/v1/documents",
            files={"file": ("library.txt", b"The Holobox library opens at 8 AM on weekdays and closes at 6 PM.", "text/plain")},
            data={"scope": "user"},
            headers={"X-User-Id": "alice"},
        )
        assert uploaded.status_code == 201
        assert uploaded.json()["status"] == "ready"
        assert uploaded.json()["chunk_count"] >= 1

        answer = client.post(
            "/api/v1/query",
            json={"question": "When does the library open?", "owner_id": "alice", "include_sources": True},
            headers={"X-User-Id": "alice"},
        )
        assert answer.status_code == 200
        body = answer.json()
        assert body["generation_mode"] == "mock"
        assert body["answer"].startswith(LABEL)
        assert body["retrieved_context_available"] is True
        assert body["sources"]
        assert "8 AM" in body["sources"][0]["excerpt"]

        unrelated = client.post(
            "/api/v1/query",
            json={"question": "What is the capital of France?", "owner_id": "alice"},
            headers={"X-User-Id": "alice"},
        ).json()
        assert unrelated["retrieved_context_available"] is False
        assert "don't have enough information" in unrelated["answer"]

        deleted = client.delete(
            f"/api/v1/documents/{uploaded.json()['id']}",
            headers={"X-User-Id": "alice"},
        )
        assert deleted.status_code == 200
        assert client.app.state.vector_store.count() == 0

    get_settings.cache_clear()
