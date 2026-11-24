"""Local faster-whisper transcription. Model loads lazily on first use."""

from __future__ import annotations

from pathlib import Path
import threading

from app.speech_to_text.base import TranscriptionResult


class FasterWhisperProvider:
    def __init__(self, model_size: str = "base", device: str = "cpu") -> None:
        self.model_name = model_size
        self.device = device
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from faster_whisper import WhisperModel

                    self._model = WhisperModel(self.model_name, device=self.device, compute_type="int8")
        return self._model

    def transcribe(self, audio_path: Path, language: str | None = None) -> TranscriptionResult:
        segments, info = self._load().transcribe(str(audio_path), language=language, beam_size=5)
        text = " ".join(segment.text for segment in segments).strip()
        return TranscriptionResult(
            text=text,
            language=info.language,
            duration_seconds=float(info.duration) if info.duration else None,
        )
