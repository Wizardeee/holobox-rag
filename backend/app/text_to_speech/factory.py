"""TTS service factory."""

from app.core.config import Settings
from app.text_to_speech.piper import PiperTTSService


def create_tts_service(settings: Settings) -> PiperTTSService:
    return PiperTTSService(settings)
