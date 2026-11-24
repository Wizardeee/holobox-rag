"""Local Piper TTS with content-hash audio caching and precise diagnostics."""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
import platform
import subprocess

from app.core.config import Settings
from app.text_to_speech.base import TTSUnavailableError

logger = logging.getLogger(__name__)


class PiperTTSService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.binary = Path(settings.piper_binary).expanduser() if settings.piper_binary else None
        self.default_voice = Path(settings.piper_voice).expanduser() if settings.piper_voice else None

    @property
    def available(self) -> bool:
        return (
            self.binary is not None
            and self.default_voice is not None
            and self.binary.is_file()
            and os.access(self.binary, os.X_OK)
            and self.default_voice.is_file()
        )

    def describe(self) -> dict[str, object]:
        """Diagnostic snapshot for startup logs (paths are not secrets)."""
        return {
            "binary": str(self.binary) if self.binary else None,
            "binary_exists": self.binary.is_file() if self.binary else False,
            "binary_executable": os.access(self.binary, os.X_OK) if self.binary else False,
            "voice": str(self.default_voice) if self.default_voice else None,
            "voice_exists": self.default_voice.is_file() if self.default_voice else False,
            "available": self.available,
        }

    def list_voices(self) -> list[str]:
        if self.default_voice is None:
            return []
        return [self.default_voice.stem]

    def _voice_path(self, voice: str | None) -> Path:
        if not voice:
            if self.default_voice is None:
                raise TTSUnavailableError(
                    "No Piper voice model is configured", "tts_voice_not_configured"
                )
            return self.default_voice
        candidate = Path(voice).expanduser()
        if not candidate.is_absolute():
            base = self.default_voice.parent if self.default_voice else Path.cwd()
            candidate = base / candidate
            if not candidate.exists() and not candidate.suffix:
                candidate = candidate.with_suffix(".onnx")
        if not candidate.is_file():
            raise TTSUnavailableError(f"Piper voice model not found: {candidate}", "tts_voice_missing")
        return candidate

    def _cache_path(self, text: str, voice_path: Path) -> Path:
        key = hashlib.sha256(f"{voice_path}|{text}".encode("utf-8")).hexdigest()
        return self.settings.audio_cache_dir / f"{key}.wav"

    def _environment(self) -> dict[str, str]:
        env = os.environ.copy()
        if platform.system() == "Darwin" and self.binary is not None:
            # The maintained macOS build ships shared libraries next to bin/.
            lib_dir = self.binary.parent.parent / "lib"
            if lib_dir.exists():
                existing = env.get("DYLD_LIBRARY_PATH", "")
                env["DYLD_LIBRARY_PATH"] = f"{lib_dir}:{existing}" if existing else str(lib_dir)
        return env

    def _validate_binary(self) -> None:
        if self.binary is None:
            raise TTSUnavailableError(
                "Piper binary is not configured", "tts_binary_not_configured"
            )
        if not self.binary.is_file():
            raise TTSUnavailableError(f"Piper binary not found: {self.binary}", "tts_binary_missing")
        if not os.access(self.binary, os.X_OK):
            raise TTSUnavailableError(
                f"Piper binary is not executable: {self.binary}", "tts_binary_not_executable"
            )

    @staticmethod
    def _validate_voice(voice_path: Path) -> None:
        if not voice_path.is_file():
            raise TTSUnavailableError(f"Piper voice model not found: {voice_path}", "tts_voice_missing")

    def synthesize(self, text: str, voice: str | None = None) -> bytes:
        self._validate_binary()
        voice_path = self._voice_path(voice)
        self._validate_voice(voice_path)
        cached = self._cache_path(text, voice_path)
        if cached.exists():
            logger.debug("Using cached audio for %s", cached.name)
            return cached.read_bytes()

        temporary = self.settings.tmp_dir / f"{cached.stem}.wav"
        command = [str(self.binary), "--model", str(voice_path), "--output_file", str(temporary)]
        try:
            result = subprocess.run(
                command,
                input=text,
                text=True,
                capture_output=True,
                timeout=90,
                env=self._environment(),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            logger.exception("Piper synthesis timed out after 90s")
            raise TTSUnavailableError("Piper synthesis timed out", "tts_timeout") from exc
        except OSError as exc:
            logger.exception("Piper process could not be launched")
            raise TTSUnavailableError(
                "Piper process could not be launched (see backend logs)", "tts_launch_failed"
            ) from exc

        if result.returncode != 0:
            logger.error("Piper exited with %s. stderr: %s", result.returncode, result.stderr[-2000:])
            raise TTSUnavailableError(
                f"Piper exited with code {result.returncode} (see backend logs)",
                "tts_generation_failed",
            )
        if not temporary.exists() or temporary.stat().st_size == 0:
            logger.error("Piper produced no WAV file. stderr: %s", result.stderr[-2000:])
            raise TTSUnavailableError("Piper produced no audio output", "tts_empty_output")

        audio = temporary.read_bytes()
        if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
            logger.error("Piper output is not a WAV file: %r", audio[:16])
            temporary.unlink(missing_ok=True)
            raise TTSUnavailableError("Piper produced an invalid WAV file", "tts_invalid_wav")
        temporary.replace(cached)
        return audio
