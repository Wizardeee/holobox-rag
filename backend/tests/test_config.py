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


def test_data_paths_are_derived_from_data_dir(tmp_path):
    settings = Settings(data_dir=tmp_path)
    assert settings.uploads_dir == tmp_path / "uploads"
    assert settings.chroma_dir == tmp_path / "chroma"
    assert settings.database_path == tmp_path / "holobox.db"


def test_overlap_must_be_smaller_than_chunk_size():
    with pytest.raises(ValidationError, match="chunk_overlap"):
        Settings(chunk_size=500, chunk_overlap=500)
