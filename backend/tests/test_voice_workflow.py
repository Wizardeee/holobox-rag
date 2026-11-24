"""Stage 10 acceptance: microphone audio -> transcription -> RAG -> answer -> speech."""

from app.speech_to_text.base import TranscriptionResult
from app.text_to_speech.base import TTSUnavailableError
from tests.helpers import make_wav


def test_complete_voice_workflow(client):
    client.post(
        "/api/v1/documents",
        files={"file": ("library.txt", b"The Holobox library opens at 8 AM on weekdays.", "text/plain")},
        data={"scope": "user"},
        headers={"X-User-Id": "alice"},
    )

    client.app.state.stt_provider.transcribe = lambda path, language=None: TranscriptionResult(
        text="When does the library open?", language="en", duration_seconds=1.0
    )

    transcribed = client.post(
        "/api/v1/transcribe",
        files={"audio": ("recording.webm", make_wav(), "audio/webm")},
        data={"language": "en"},
        headers={"X-User-Id": "alice"},
    )
    assert transcribed.status_code == 200
    question = transcribed.json()["text"]
    assert question == "When does the library open?"

    # Transcription is independent: it must not trigger answer generation.
    assert client.app.state.llm_provider.calls == []

    answered = client.post(
        "/api/v1/query",
        json={"question": question, "owner_id": "alice", "include_sources": True},
        headers={"X-User-Id": "alice"},
    ).json()
    assert answered["sources"]
    assert answered["retrieved_context_available"] is True

    spoken = client.post(
        "/api/v1/synthesize",
        json={"text": answered["answer"]},
        headers={"X-User-Id": "alice"},
    )
    assert spoken.status_code == 200
    assert spoken.content.startswith(b"RIFF")
    assert client.app.state.tts_service.calls[0][0] == answered["answer"]


def test_text_still_works_when_voice_services_fail(client):
    client.post(
        "/api/v1/documents",
        files={"file": ("notes.txt", b"Cloud computing lecture notes.", "text/plain")},
        data={"scope": "user"},
        headers={"X-User-Id": "alice"},
    )

    def broken_stt(_path, _language=None):
        raise RuntimeError("microphone service down")

    def broken_tts(_text, _voice=None):
        raise TTSUnavailableError("voice service down")

    client.app.state.stt_provider.transcribe = broken_stt
    client.app.state.tts_service.synthesize = broken_tts

    failed_transcription = client.post(
        "/api/v1/transcribe",
        files={"audio": ("recording.webm", make_wav(), "audio/webm")},
        headers={"X-User-Id": "alice"},
    )
    assert failed_transcription.status_code == 500

    failed_synthesis = client.post(
        "/api/v1/synthesize",
        json={"text": "hello"},
        headers={"X-User-Id": "alice"},
    )
    assert failed_synthesis.status_code == 503

    text_answer = client.post(
        "/api/v1/query",
        json={"question": "What are the notes about?", "owner_id": "alice"},
        headers={"X-User-Id": "alice"},
    )
    assert text_answer.status_code == 200
    assert text_answer.json()["retrieved_context_available"] is True
