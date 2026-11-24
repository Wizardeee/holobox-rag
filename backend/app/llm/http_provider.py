"""Generic OpenAI-compatible HTTP provider.

No endpoint, model or credential is assumed. The college-specific adapter must
be implemented from the college's real API documentation when it is available.
"""

from __future__ import annotations

import json
from typing import Iterator

import httpx

from app.llm.base import LLMResponse
from app.models.schemas import GenerationMode


class HttpProvider:
    id = "http"
    mode = GenerationMode.LIVE
    is_configured = True
    supports_streaming = True

    def __init__(self, base_url: str, api_key: str | None, model: str | None, timeout: float) -> None:
        self.base_url = base_url
        self.api_key = api_key
        self.model = model or "default"
        self.timeout = timeout

    @property
    def endpoint(self) -> str:
        return f"{self.base_url.rstrip('/')}/chat/completions"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _payload(self, prompt: str, stream: bool = False) -> dict:
        return {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "stream": stream,
        }

    def generate(self, prompt: str, *, timeout: float | None = None) -> LLMResponse:
        try:
            with httpx.Client(timeout=timeout or self.timeout) as client:
                response = client.post(self.endpoint, json=self._payload(prompt), headers=self._headers())
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"]
            return LLMResponse(text=text, mode=GenerationMode.LIVE)
        except Exception as exc:
            return LLMResponse(
                text="The configured LLM endpoint could not be reached. Document excerpts are still shown below.",
                mode=GenerationMode.UNAVAILABLE,
                warning=f"provider_error: {type(exc).__name__}",
            )

    def stream(self, prompt: str, *, timeout: float | None = None) -> Iterator[str]:
        try:
            with httpx.Client(timeout=timeout or self.timeout) as client:
                with client.stream(
                    "POST", self.endpoint, json=self._payload(prompt, stream=True), headers=self._headers()
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line.removeprefix("data:").strip()
                        if payload == "[DONE]":
                            break
                        choice = json.loads(payload)["choices"][0].get("delta", {})
                        if token := choice.get("content"):
                            yield token
        except Exception:
            return
