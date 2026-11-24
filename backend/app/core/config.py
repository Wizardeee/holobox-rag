"""Central configuration. All values are overridable with HOLOBOX_* env vars."""

from functools import lru_cache
import os
from pathlib import Path
import shutil

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
# Anchor to the backend folder so `uvicorn app.main:app` loads .env regardless
# of the directory the process was started from.
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="HOLOBOX_",
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = BACKEND_ROOT / "data"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    api_token: str | None = None

    max_upload_mb: int = Field(default=50, ge=1, le=500)
    allowed_extensions: str = ".pdf,.docx,.txt,.md"
    chunk_size: int = Field(default=800, ge=100, le=4000)
    chunk_overlap: int = Field(default=120, ge=0, le=500)
    retrieval_top_k: int = Field(default=5, ge=1, le=20)
    retrieval_min_score: float = Field(default=0.15, ge=0.0, le=1.0)

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chroma_collection: str = "holobox_chunks"

    llm_provider: str = "mock"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_seconds: float = Field(default=30.0, gt=0)

    stt_model: str = "base"
    stt_device: str = "cpu"
    stt_language: str | None = None
    piper_binary: str | None = None
    piper_voice: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def allowed_extensions_set(self) -> set[str]:
        return {item.strip().lower() for item in self.allowed_extensions.split(",") if item.strip()}

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def chroma_dir(self) -> Path:
        return self.data_dir / "chroma"

    @property
    def audio_cache_dir(self) -> Path:
        return self.data_dir / "audio_cache"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "holobox.db"

    @model_validator(mode="after")
    def discover_piper(self) -> "Settings":
        """Fall back to common local Piper locations when no env value is set.

        Explicit HOLOBOX_PIPER_* values (including those in .env) always win.
        """
        home = Path.home()
        if not self.piper_binary:
            candidates = [
                home / "Desktop" / "piper" / "macos-piper" / "bin" / "piper",
                home / "Desktop" / "piper" / "piper",
                home / ".local" / "bin" / "piper",
            ]
            on_path = shutil.which("piper")
            if on_path:
                candidates.append(Path(on_path))
            for candidate in candidates:
                if candidate.is_file() and os.access(candidate, os.X_OK):
                    self.piper_binary = str(candidate)
                    break
        if not self.piper_voice:
            candidates = [
                home / "Desktop" / "piper" / "en_US-lessac-medium.onnx",
                home / "Desktop" / "piper" / "voice.onnx",
            ]
            for candidate in candidates:
                if candidate.is_file():
                    self.piper_voice = str(candidate)
                    break
        return self

    @model_validator(mode="after")
    def reject_mock_in_production(self) -> "Settings":
        if self.environment.lower() in {"prod", "production"} and self.llm_provider.lower() == "mock":
            raise ValueError("The mock LLM provider is not allowed in production")
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be smaller than chunk_size")
        return self

    def ensure_directories(self) -> None:
        for path in (self.data_dir, self.uploads_dir, self.chroma_dir, self.audio_cache_dir, self.tmp_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
