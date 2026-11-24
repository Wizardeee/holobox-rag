from tests.helpers import make_wav


def _upload(client, filename="recording.webm", content=b"audio-data", language="hi"):
    return client.post(
        "/api/v1/transcribe",
        files={"audio": (filename, content, "audio/webm")},
        data={"language": language},
        headers={"X-User-Id": "alice"},
    )


def test_transcribe_returns_text_and_cleans_up_temp_file(client, tmp_path):
    response = _upload(client)
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "transcribed test audio"
    assert body["language"] == "hi"
    assert list((tmp_path / "data" / "tmp").glob("*")) == []


def test_transcribe_rejects_bad_audio(client):
    assert _upload(client, filename="notes.txt", content=b"x").status_code == 415
    assert _upload(client, content=b"").status_code == 400


def test_transcribe_failure_uses_error_envelope(client):
    provider = client.app.state.stt_provider

    def fail(_path, _language):
        raise RuntimeError("decoder crashed")

    provider.transcribe = fail
    response = _upload(client, content=make_wav())
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "transcription_failed"
