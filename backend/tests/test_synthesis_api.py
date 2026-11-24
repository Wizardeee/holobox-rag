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


def test_capabilities_include_tts_voice(client):
    voices = client.get("/api/v1/config/capabilities").json()["tts_voices"]
    assert voices == ["fake-voice"]
