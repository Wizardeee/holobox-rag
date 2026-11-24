import json

import httpx

from app.core.config import Settings
from app.llm.college import CollegeProvider
from app.llm.factory import get_llm_provider
from app.llm.http_provider import HttpProvider
from app.llm.mock import LABEL, MockProvider
from app.llm.unavailable import UnavailableProvider
from app.models.schemas import GenerationMode


def test_mock_response_is_clearly_labelled():
    provider = MockProvider()
    response = provider.generate("Context excerpts:\n[1] doc: text\n\nQuestion: Where?\n\nAnswer:")
    assert response.mode == GenerationMode.MOCK
    assert response.warning == "mock_provider"
    assert response.text.startswith(LABEL)
    assert "not a genuine answer" in response.text.lower()
    assert list(provider.stream("prompt"))


def test_http_provider_generates_from_configured_endpoint(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "real answer"}}]})

    original_client = httpx.Client
    monkeypatch.setattr(
        "app.llm.http_provider.httpx.Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    provider = HttpProvider("http://llm.local/v1", "secret", "my-model", 5.0)
    response = provider.generate("explain clouds")
    assert response.text == "real answer"
    assert response.mode == GenerationMode.LIVE
    assert seen["url"] == "http://llm.local/v1/chat/completions"
    assert seen["payload"]["messages"][0]["content"] == "explain clouds"
    assert seen["payload"]["model"] == "my-model"


def test_http_provider_failure_is_unavailable(monkeypatch):
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    original_client = httpx.Client
    monkeypatch.setattr(
        "app.llm.http_provider.httpx.Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    response = HttpProvider("http://llm.local/v1", None, None, 5.0).generate("question")
    assert response.mode == GenerationMode.UNAVAILABLE
    assert response.warning.startswith("provider_error")


def test_http_provider_streams_tokens(monkeypatch):
    body = (
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
        "data: [DONE]\n\n"
    )

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body.encode(), headers={"content-type": "text/event-stream"})

    original_client = httpx.Client
    monkeypatch.setattr(
        "app.llm.http_provider.httpx.Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    assert list(HttpProvider("http://llm.local", None, None, 5.0).stream("prompt")) == ["hello", " world"]


def test_college_provider_reports_unconfigured():
    provider = CollegeProvider()
    response = provider.generate("prompt")
    assert response.mode == GenerationMode.UNAVAILABLE
    assert "not connected" in response.text
    assert provider.is_configured is False


def test_provider_selection():
    assert isinstance(get_llm_provider(Settings(llm_provider="mock")), MockProvider)
    assert isinstance(get_llm_provider(Settings(llm_provider="college")), CollegeProvider)
    assert isinstance(get_llm_provider(Settings(llm_provider="http")), UnavailableProvider)
    assert isinstance(
        get_llm_provider(Settings(llm_provider="http", llm_base_url="http://llm.local")),
        HttpProvider,
    )
