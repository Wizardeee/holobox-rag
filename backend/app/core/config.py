"""Central configuration. All values are overridable with HOLOBOX_* env vars."""

from functools import lru_cache
import logging
import os
from pathlib import Path
import shutil

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

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

    # --- Role-based access (teacher portal + student kiosk) ----------------
    auth_enabled: bool = True
    auth_secret: str = "dev-only-secret-replace-in-env"
    token_ttl_seconds: int = Field(default=8 * 3600, ge=60)
    teacher_username: str = "teacher"
    teacher_display_name: str = "Teacher"
    teacher_password_hash: str = ""
    kiosk_token: str = "dev-only-kiosk-token-replace-in-env"
    # Empty = kiosk may use every active course; otherwise comma-separated ids.
    kiosk_courses: str = ""
    seed_courses: str = "gpu-architecture:GPU Architecture & Programming;general:General Studies"

    max_upload_mb: int = Field(default=50, ge=1, le=500)
    allowed_extensions: str = ".pdf,.docx,.txt,.md"
    chunk_size: int = Field(default=800, ge=100, le=4000)
    chunk_overlap: int = Field(default=120, ge=0, le=500)
    retrieval_top_k: int = Field(default=5, ge=1, le=20)
    retrieval_min_score: float = Field(default=0.15, ge=0.0, le=1.0)

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chroma_collection: str = "holobox_chunks"

    llm_provider: str = "http"
    llm_base_url: str | None = "http://127.0.0.1:11434/v1"
    llm_api_key: str | None = None
    llm_model: str | None = "qwen3:14b"
    llm_timeout_seconds: float = Field(default=120.0, gt=0)
    llm_context_tokens: int = Field(default=8192, ge=512, le=131072)
    # None = derive from the model (Qwen3 gets /no_think, others do not).
    llm_no_think: bool | None = None
    # Spoken answers stay in this language unless the user explicitly asks otherwise.
    response_language: str = "English"

    stt_model: str = "base"
    stt_device: str = "cpu"
    stt_language: str | None = None
    piper_binary: str | None = None
    piper_voice: str | None = None

    # Camera-triggered voice sessions. The kiosk owns the microphone; the backend
    # coordinates presence, the listening window and the resulting answer flow.
    voice_listen_seconds: float = Field(default=5.0, gt=0, le=30)
    voice_presence_debounce_seconds: float = Field(default=1.0, ge=0, le=30)
    voice_presence_cooldown_seconds: float = Field(default=15.0, ge=0, le=600)

    @property
    def no_think_enabled(self) -> bool:
        if self.llm_no_think is not None:
            return self.llm_no_think
        return (self.llm_model or "").lower().startswith("qwen3")

    @property
    def listen_window_ms(self) -> int:
        return int(self.voice_listen_seconds * 1000)

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def kiosk_courses_set(self) -> set[str] | None:
        values = {item.strip() for item in self.kiosk_courses.split(",") if item.strip()}
        return values or None

    @property
    def seed_courses_list(self) -> list[tuple[str, str]]:
        courses: list[tuple[str, str]] = []
        for item in self.seed_courses.split(";"):
            if not item.strip() or ":" not in item:
                continue
            course_id, name = item.split(":", 1)
            courses.append((course_id.strip(), name.strip()))
        return courses

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
    def resolve_piper_paths(self) -> "Settings":
        """Validate configured Piper paths, then fall back to known local locations.

        A stale HOLOBOX_PIPER_* shell variable overrides `.env` in
        pydantic-settings. If it points to a missing/non-executable file we must
        not treat it as a valid configuration — discard it and discover the real
        installation instead, logging what happened.
        """
        if self.piper_binary:
            binary = Path(self.piper_binary).expanduser()
            if not binary.is_file() or not os.access(binary, os.X_OK):
                logger.warning(
                    "Configured Piper binary is unusable, ignoring it: %s", self.piper_binary
                )
                self.piper_binary = None
        if self.piper_voice:
            voice = Path(self.piper_voice).expanduser()
            if not voice.is_file():
                logger.warning("Configured Piper voice is missing, ignoring it: %s", self.piper_voice)
                self.piper_voice = None

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
    def require_production_auth(self) -> "Settings":
        if self.environment.lower() in {"prod", "production"}:
            if not self.auth_enabled:
                raise ValueError("Authentication must be enabled in production")
            if not self.teacher_password_hash:
                raise ValueError("HOLOBOX_TEACHER_PASSWORD_HASH is required in production")
            if "dev-only" in self.auth_secret or "dev-only" in self.kiosk_token:
                raise ValueError("Replace dev-only auth secret and kiosk token in production")
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
