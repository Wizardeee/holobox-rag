def test_synthesize_returns_wav_bytes(client):
    response = client.post(
        "/api/v1/synthesize",
        json={"text": "Hello from Holobox."},
        headers={"X-User-Id": "alice"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.content.startswith(b"RIFF")
    assert client.app.state.tts_service.calls[0][0] == "Hello from Holobox."


def test_synthesize_validates_input(client):
    response = client.post("/api/v1/synthesize", json={"text": ""})
    assert response.status_code == 422


def test_service_error_code_propagates_to_api(client):
    from app.text_to_speech.base import TTSUnavailableError

    def fail(_text, _voice=None):
        raise TTSUnavailableError("Piper synthesis timed out", "tts_timeout")

    client.app.state.tts_service.synthesize = fail
    response = client.post(
        "/api/v1/synthesize",
        json={"text": "hello"},
        headers={"X-User-Id": "alice"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == {"code": "tts_timeout", "message": "Piper synthesis timed out"}


def test_capabilities_include_tts_voice(client):
    voices = client.get("/api/v1/config/capabilities").json()["tts_voices"]
    assert voices == ["fake-voice"]
