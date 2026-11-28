import base64

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.services.voice_sessions import VoiceSessionCoordinator
from app.speech_to_text.base import TranscriptionResult
from tests.helpers import make_wav


def _no_debounce(client):
    client.app.state.voice_sessions = VoiceSessionCoordinator(
        listen_seconds=5.0, debounce_seconds=0, cooldown_seconds=15.0
    )
    return client.app.state.voice_sessions


def test_presence_returns_five_second_listen_window(client):
    coordinator = _no_debounce(client)
    first = client.post("/api/v1/voice/presence", json={"present": False}).json()
    assert first["listen"] is False and first["reason"] == "absent"

    decision = client.post("/api/v1/voice/presence", json={"present": True}).json()
    assert decision["listen"] is True
    assert decision["listen_ms"] == 5000
    assert decision["session_id"]
    assert coordinator.active_session() == decision["session_id"]

    repeated = client.post("/api/v1/voice/presence", json={"present": True}).json()
    assert repeated["listen"] is False
    assert repeated["reason"] == "session_active"


def test_capture_runs_transcription_rag_and_tts_once(client):
    coordinator = _no_debounce(client)
    session = client.post("/api/v1/voice/presence", json={"present": True}).json()["session_id"]
    response = client.post(
        "/api/v1/voice/capture",
        data={"session_id": session},
        files={"audio": ("question.wav", make_wav(), "audio/wav")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["text"]
    assert body["answer"]
    assert base64.b64decode(body["audio_base64"]).startswith(b"RIFF")
    assert coordinator.active_session() is None

    # The same session cannot be reused for a second answer.
    again = client.post(
        "/api/v1/voice/capture",
        data={"session_id": session},
        files={"audio": ("question.wav", make_wav(), "audio/wav")},
    )
    assert again.status_code == 409


def test_no_speech_does_not_generate_an_answer_or_audio(client):
    coordinator = _no_debounce(client)
    client.app.state.stt_provider.transcribe = lambda path, language=None: TranscriptionResult(
        text="   ", language="en", duration_seconds=1.0
    )
    session = client.post("/api/v1/voice/presence", json={"present": True}).json()["session_id"]
    body = client.post(
        "/api/v1/voice/capture",
        data={"session_id": session},
        files={"audio": ("silent.wav", make_wav(), "audio/wav")},
    ).json()
    assert body["status"] == "no_speech"
    assert body["answer"] == ""
    assert body["audio_base64"] is None
    assert coordinator.active_session() is None


def test_capture_reports_transcription_failure_without_crashing(client):
    coordinator = _no_debounce(client)

    def broken(path, language=None):
        raise RuntimeError("stt down")

    client.app.state.stt_provider.transcribe = broken
    session = client.post("/api/v1/voice/presence", json={"present": True}).json()["session_id"]
    response = client.post(
        "/api/v1/voice/capture",
        data={"session_id": session},
        files={"audio": ("question.wav", make_wav(), "audio/wav")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "error"
    assert "transcription_failed" in body["warning"]
    assert coordinator.active_session() is None


def test_presence_endpoint_requires_token_when_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_AUTH_ENABLED", "true")
    monkeypatch.setenv("HOLOBOX_KIOSK_TOKEN", "secret-token")
    get_settings.cache_clear()
    with TestClient(create_app()) as secured:
        assert secured.post("/api/v1/voice/presence", json={"present": True}).status_code == 401
        ok = secured.post(
            "/api/v1/voice/presence",
            json={"present": True},
            headers={"Authorization": "Bearer secret-token"},
        )
        assert ok.status_code == 200
    get_settings.cache_clear()
