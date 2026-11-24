"""Local Piper TTS with content-hash audio caching."""

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
        self.binary = Path(settings.piper_binary) if settings.piper_binary else None
        self.default_voice = Path(settings.piper_voice) if settings.piper_voice else None

    @property
    def available(self) -> bool:
        return self.binary is not None and self.default_voice is not None and self.binary.exists()

    def list_voices(self) -> list[str]:
        if self.default_voice is None:
            return []
        return [self.default_voice.stem]

    def _voice_path(self, voice: str | None) -> Path:
        if not voice:
            if self.default_voice is None:
                raise TTSUnavailableError("No Piper voice model is configured")
            return self.default_voice
        candidate = Path(voice)
        if not candidate.is_absolute():
            candidate = (self.default_voice.parent / candidate) if self.default_voice else Path(voice)
        if not candidate.exists():
            raise TTSUnavailableError(f"Piper voice model not found: {candidate}")
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

    def synthesize(self, text: str, voice: str | None = None) -> bytes:
        if not self.available:
            raise TTSUnavailableError("Piper is not configured (set HOLOBOX_PIPER_BINARY and HOLOBOX_PIPER_VOICE)")
        voice_path = self._voice_path(voice)
        cached = self._cache_path(text, voice_path)
        if cached.exists():
            logger.debug("Using cached audio for %s", cached.name)
            return cached.read_bytes()

        temporary = self.settings.tmp_dir / f"{cached.stem}.wav"
        command = [
            str(self.binary),
            "--model",
            str(voice_path),
            "--output_file",
            str(temporary),
        ]
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
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise TTSUnavailableError(f"Piper could not generate audio: {exc}") from exc
        if result.returncode != 0 or not temporary.exists():
            raise TTSUnavailableError(f"Piper failed: {result.stderr[-500:]}")
        audio = temporary.read_bytes()
        temporary.replace(cached)
        return audio
