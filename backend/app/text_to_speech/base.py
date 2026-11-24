"""Text-to-speech interface. Independent of the LLM and RAG pipeline."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class TTSUnavailableError(Exception):
    """Raised when no TTS engine is configured or the engine fails."""


@runtime_checkable
class TTSService(Protocol):
    available: bool

    def synthesize(self, text: str, voice: str | None = None) -> bytes: ...

    def list_voices(self) -> list[str]: ...
