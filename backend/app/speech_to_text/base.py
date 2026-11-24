"""Speech-to-text interface, independent of RAG and the LLM."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float | None


@runtime_checkable
class STTProvider(Protocol):
    model_name: str

    def transcribe(self, audio_path: Path, language: str | None = None) -> TranscriptionResult: ...
