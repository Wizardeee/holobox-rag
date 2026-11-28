import pytest
from pydantic import ValidationError

from app.core.config import BACKEND_ROOT, ENV_FILE, Settings


def test_env_file_is_anchored_to_backend_directory():
    # Config must load backend/.env even when uvicorn starts from another cwd.
    assert ENV_FILE == BACKEND_ROOT / ".env"


def test_mock_provider_rejected_in_production():
    with pytest.raises(ValidationError, match="production"):
        Settings(environment="production", llm_provider="mock")


def test_non_mock_provider_allowed_in_production():
    assert Settings(environment="production", llm_provider="http").llm_provider == "http"


def test_defaults_use_qwen3_and_stable_english(monkeypatch):
    # Ignore the local .env so this checks code defaults, not a dev override.
    for key in ("HOLOBOX_LLM_MODEL", "HOLOBOX_LLM_PROVIDER", "HOLOBOX_LLM_BASE_URL",
                "HOLOBOX_RESPONSE_LANGUAGE", "HOLOBOX_LLM_CONTEXT_TOKENS",
                "HOLOBOX_VOICE_LISTEN_SECONDS"):
        monkeypatch.delenv(key, raising=False)
    settings = Settings(_env_file=None)
    assert settings.llm_provider == "http"
    assert settings.llm_base_url == "http://127.0.0.1:11434/v1"
    assert settings.llm_model == "qwen3:14b"
    assert settings.llm_context_tokens == 8192
    assert settings.response_language == "English"
    assert settings.no_think_enabled is True
    assert settings.listen_window_ms == 5000


def test_no_think_is_model_derived_unless_overridden():
    assert Settings(llm_model="llama3.2:latest").no_think_enabled is False
    assert Settings(llm_model="qwen3:14b", llm_no_think=False).no_think_enabled is False


def test_data_paths_are_derived_from_data_dir(tmp_path):
    settings = Settings(data_dir=tmp_path)
    assert settings.uploads_dir == tmp_path / "uploads"
    assert settings.chroma_dir == tmp_path / "chroma"
    assert settings.database_path == tmp_path / "holobox.db"


def test_overlap_must_be_smaller_than_chunk_size():
    with pytest.raises(ValidationError, match="chunk_overlap"):
        Settings(chunk_size=500, chunk_overlap=500)
