"""LLM provider resolution. Concrete providers are registered in Stage 5."""

from app.core.config import Settings
from app.llm.base import LLMProvider
from app.llm.unavailable import UnavailableProvider


def get_llm_provider(settings: Settings) -> LLMProvider:
    return UnavailableProvider()
