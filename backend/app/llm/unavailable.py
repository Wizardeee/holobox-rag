"""Explicitly unavailable provider: no configuration, no fabricated answers."""

from app.llm.base import LLMResponse
from app.models.schemas import GenerationMode


class UnavailableProvider:
    id = "none"
    mode = GenerationMode.UNAVAILABLE
    is_configured = False
    supports_streaming = False

    def generate(self, prompt: str, *, timeout: float | None = None) -> LLMResponse:
        return LLMResponse(
            text=(
                "Answer generation is unavailable because no LLM provider is configured. "
                "The relevant document excerpts are still shown as sources."
            ),
            mode=GenerationMode.UNAVAILABLE,
            warning="provider_unavailable",
        )
