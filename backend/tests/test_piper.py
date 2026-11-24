"""Real Piper smoke test against local binary and voice when available."""

from pathlib import Path
import pytest

from app.core.config import Settings
from app.text_to_speech.base import TTSUnavailableError
from app.text_to_speech.piper import PiperTTSService

BINARY = Path.home() / "Desktop" / "piper" / "macos-piper" / "bin" / "piper"
VOICE = Path.home() / "Desktop" / "piper" / "en_US-lessac-medium.onnx"


@pytest.fixture
def service(tmp_path):
    if not BINARY.exists() or not VOICE.exists():
        pytest.skip("Local Piper binary/voice not installed")
    settings = Settings(
        data_dir=tmp_path / "data",
        piper_binary=str(BINARY),
        piper_voice=str(VOICE),
    )
    settings.ensure_directories()
    return PiperTTSService(settings)


def test_piper_generates_and_caches_audio(service):
    first = service.synthesize("Hello from Holobox.")
    assert first.startswith(b"RIFF")
    assert service.list_voices() == ["en_US-lessac-medium"]
    cached = list(service.settings.audio_cache_dir.glob("*.wav"))
    assert len(cached) == 1
    assert service.synthesize("Hello from Holobox.") == first
    assert len(list(service.settings.audio_cache_dir.glob("*.wav"))) == 1


def test_default_settings_expose_configured_piper_paths():
    settings = Settings()
    if not settings.piper_binary or not settings.piper_voice:
        pytest.skip("No local Piper assets configured")
    assert Path(settings.piper_binary).exists()
    assert Path(settings.piper_voice).exists()
    assert PiperTTSService(settings).available


def test_piper_unavailable_when_configured_paths_are_missing(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "data",
        piper_binary="/nonexistent/piper",
        piper_voice="/nonexistent/voice.onnx",
    )
    settings.ensure_directories()
    with pytest.raises(TTSUnavailableError):
        PiperTTSService(settings).synthesize("hello")
