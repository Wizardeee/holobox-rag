"""Text-to-speech interface. Independent of the LLM and RAG pipeline."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class TTSUnavailableError(Exception):
    """TTS could not produce audio. `code` is safe to return to the client."""

    def __init__(self, message: str, code: str = "tts_unavailable") -> None:
        super().__init__(message)
        self.code = code


@runtime_checkable
class TTSService(Protocol):
    available: bool

    def synthesize(self, text: str, voice: str | None = None) -> bytes: ...

    def list_voices(self) -> list[str]: ...
