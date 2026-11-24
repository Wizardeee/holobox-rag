"""Shared test fixtures: isolated data dir, fake AI backends, in-process client."""

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.config import get_settings
from tests.fakes import FakeEmbedder, FakeVectorStore


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_LLM_PROVIDER", "mock")
    monkeypatch.delenv("HOLOBOX_API_TOKEN", raising=False)
    monkeypatch.setattr(main_module, "create_embedder", lambda settings: FakeEmbedder())
    monkeypatch.setattr(main_module, "create_vector_store", lambda settings: FakeVectorStore())
    get_settings.cache_clear()
    app = main_module.create_app()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()
