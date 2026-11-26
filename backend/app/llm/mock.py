"""Development/test provider. Every response is explicitly labelled as fake."""

from __future__ import annotations

import re
from typing import Iterator

from app.llm.base import LLMResponse
from app.models.schemas import GenerationMode

LABEL = "[DEVELOPMENT TEST RESPONSE — NOT AN AI ANSWER]"


class MockProvider:
    id = "mock"
    mode = GenerationMode.MOCK
    is_configured = True
    supports_streaming = True

    def _text(self, prompt: str) -> str:
        match = re.search(r"Question: (.*?)\n\nAnswer:", prompt, re.DOTALL)
        question = match.group(1).strip() if match else "(question not parsed)"
        excerpt_count = len(re.findall(r"^\[\d+\]", prompt, re.MULTILINE))
        grounded = excerpt_count > 0
        citation = " [1]" if grounded else ""
        return (
            f"{LABEL}\n"
            "The mock LLM provider is active; no external model was called.\n\n"
            f"Question received: {question}\n"
            f"Context excerpts retrieved: {excerpt_count}\n\n"
            "This is test output, not a genuine answer. Set HOLOBOX_LLM_PROVIDER=http "
            "with a configured endpoint to generate real answers."
            f"{citation}\n\n"
            f"META:{'documents' if grounded else 'general_knowledge'};{'full' if grounded else 'none'}"
        )

    def generate(self, prompt: str, *, timeout: float | None = None) -> LLMResponse:
        return LLMResponse(text=self._text(prompt), mode=GenerationMode.MOCK, warning="mock_provider")

    def stream(self, prompt: str, *, timeout: float | None = None) -> Iterator[str]:
        yield from self._text(prompt).split()
