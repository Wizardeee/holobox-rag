"""Placeholder for the college-hosted LLM.

The college service is not accessible and its API specification is unknown.
No endpoint, authentication scheme or request shape is invented here. Replace
this class with a real adapter once the documentation is supplied; until then
it reports unavailability honestly.
"""

from __future__ import annotations

from typing import Iterator

from app.llm.base import LLMResponse
from app.models.schemas import GenerationMode


class CollegeProvider:
    id = "college"
    mode = GenerationMode.UNAVAILABLE
    is_configured = False
    supports_streaming = False

    def generate(self, prompt: str, *, timeout: float | None = None) -> LLMResponse:
        return LLMResponse(
            text=(
                "The college-hosted LLM is not connected yet. Its API specification has not been "
                "provided, so no endpoint or credentials are assumed. Document excerpts are still shown."
            ),
            mode=GenerationMode.UNAVAILABLE,
            warning="college_provider_not_configured",
        )

    def stream(self, prompt: str, *, timeout: float | None = None) -> Iterator[str]:
        return iter(())
