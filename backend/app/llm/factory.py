"""Provider selection from configuration. Mock is refused in production."""

from app.core.config import Settings
from app.llm.base import LLMProvider
from app.llm.college import CollegeProvider
from app.llm.http_provider import HttpProvider
from app.llm.mock import MockProvider
from app.llm.unavailable import UnavailableProvider


def get_llm_provider(settings: Settings) -> LLMProvider:
    provider_id = settings.llm_provider.lower()
    if provider_id == "mock":
        return MockProvider()
    if provider_id == "http" and settings.llm_base_url:
        return HttpProvider(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            timeout=settings.llm_timeout_seconds,
            context_tokens=settings.llm_context_tokens,
        )
    if provider_id == "college":
        return CollegeProvider()
    return UnavailableProvider()
