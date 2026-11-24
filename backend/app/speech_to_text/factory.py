"""Cached STT provider factory."""

from functools import lru_cache

from app.speech_to_text.whisper import FasterWhisperProvider


@lru_cache(maxsize=4)
def get_stt_provider(model_size: str, device: str) -> FasterWhisperProvider:
    return FasterWhisperProvider(model_size, device)
