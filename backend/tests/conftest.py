"""Shared test fixtures: isolated data dir and in-process HTTP client."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_LLM_PROVIDER", "mock")
    monkeypatch.delenv("HOLOBOX_API_TOKEN", raising=False)
    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()
