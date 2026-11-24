"""Piper regression tests: real synthesis, config fallback and precise errors."""

from pathlib import Path
import subprocess

import pytest

from app.core.config import ENV_FILE, Settings
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


def _empty_home(tmp_path, monkeypatch):
    home = tmp_path / "empty-home"
    home.mkdir(exist_ok=True)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("HOLOBOX_PIPER_BINARY", raising=False)
    monkeypatch.delenv("HOLOBOX_PIPER_VOICE", raising=False)
    return home


# --- real synthesis ------------------------------------------------------

def test_piper_generates_and_caches_audio(service):
    first = service.synthesize("Hello from Holobox.")
    assert first[:4] == b"RIFF" and first[8:12] == b"WAVE"
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


# --- configuration -------------------------------------------------------

def test_paths_are_loaded_from_env_file():
    if not ENV_FILE.exists():
        pytest.skip("No local backend/.env on this machine")
    settings = Settings()
    assert settings.piper_binary and settings.piper_voice
    assert Path(settings.piper_binary).is_file()
    assert Path(settings.piper_voice).is_file()


def test_stale_env_var_is_discarded_and_real_installation_found(tmp_path, monkeypatch):
    home = _empty_home(tmp_path, monkeypatch)
    binary = home / "Desktop" / "piper" / "macos-piper" / "bin" / "piper"
    voice = home / "Desktop" / "piper" / "en_US-lessac-medium.onnx"
    binary.parent.mkdir(parents=True)
    binary.write_text("#!/bin/sh\n")
    binary.chmod(0o755)
    voice.parent.mkdir(parents=True, exist_ok=True)
    voice.write_bytes(b"onnx")

    # Simulates a stale shell export overriding the valid .env value.
    monkeypatch.setenv("HOLOBOX_PIPER_BINARY", "/Users/deekshaa/Desktop/piper/piper")
    monkeypatch.setenv("HOLOBOX_PIPER_VOICE", "/Users/deekshaa/Desktop/piper/missing.onnx")

    settings = Settings()
    assert settings.piper_binary == str(binary)
    assert settings.piper_voice == str(voice)


# --- precise failure modes ----------------------------------------------

def _service_without_discovery(tmp_path, monkeypatch, **overrides):
    home = _empty_home(tmp_path, monkeypatch)
    settings = Settings(
        data_dir=tmp_path / "data",
        piper_binary=str(home / "missing-piper"),
        piper_voice=str(home / "missing-voice.onnx"),
        **overrides,
    )
    settings.ensure_directories()
    return PiperTTSService(settings)


def test_missing_binary_and_voice_have_distinct_codes(tmp_path, monkeypatch):
    service = _service_without_discovery(tmp_path, monkeypatch)
    # Config validation discards unusable paths, so set the missing path on the
    # service directly to exercise this specific diagnostic branch.
    service.binary = Path(tmp_path / "missing-piper")
    with pytest.raises(TTSUnavailableError) as binary_error:
        service.synthesize("hello")
    assert binary_error.value.code == "tts_binary_missing"

    service.binary = BINARY  # binary valid; now exercise the voice error path
    with pytest.raises(TTSUnavailableError) as voice_error:
        service.synthesize("hello", voice="/nonexistent/voice.onnx")
    assert voice_error.value.code == "tts_voice_missing"


def test_non_executable_binary_is_reported(tmp_path, monkeypatch):
    service = _service_without_discovery(tmp_path, monkeypatch)
    not_executable = tmp_path / "not-executable"
    not_executable.write_text("binary")
    service.binary = not_executable
    service.default_voice = BINARY  # any existing voice file
    with pytest.raises(TTSUnavailableError) as error:
        service.synthesize("hello")
    assert error.value.code == "tts_binary_not_executable"


def test_not_configured_is_reported_when_paths_are_absent(tmp_path, monkeypatch):
    service = _service_without_discovery(tmp_path, monkeypatch)
    service.binary = None
    service.default_voice = None
    with pytest.raises(TTSUnavailableError) as error:
        service.synthesize("hello")
    assert error.value.code == "tts_binary_not_configured"
    service.binary = BINARY
    service.default_voice = None
    with pytest.raises(TTSUnavailableError) as error:
        service.synthesize("hello")
    assert error.value.code == "tts_voice_not_configured"


def test_subprocess_failure_logs_stderr_and_returns_precise_error(service, monkeypatch, caplog):
    def fail(*_args, **_kwargs):
        return subprocess.CompletedProcess([], 7, "", "voice model load failed")

    monkeypatch.setattr("app.text_to_speech.piper.subprocess.run", fail)
    with pytest.raises(TTSUnavailableError) as error:
        service.synthesize("this will fail")
    assert error.value.code == "tts_generation_failed"
    assert "code 7" in str(error.value)
    assert "voice model load failed" in caplog.text


def test_subprocess_timeout_is_reported(service, monkeypatch):
    def timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd="piper", timeout=90)

    monkeypatch.setattr("app.text_to_speech.piper.subprocess.run", timeout)
    with pytest.raises(TTSUnavailableError) as error:
        service.synthesize("this will time out")
    assert error.value.code == "tts_timeout"


def test_invalid_wav_output_is_rejected(service, monkeypatch):
    def bad_output(command, **kwargs):
        output = Path(command[-1])
        output.write_bytes(b"not a wav")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.text_to_speech.piper.subprocess.run", bad_output)
    with pytest.raises(TTSUnavailableError) as error:
        service.synthesize("bad wav")
    assert error.value.code == "tts_invalid_wav"
