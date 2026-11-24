"""Real faster-whisper check using the locally cached base model."""

from app.speech_to_text.whisper import FasterWhisperProvider
from tests.helpers import make_wav


def test_faster_whisper_transcribes_audio(tmp_path):
    audio = tmp_path / "tone.wav"
    audio.write_bytes(make_wav())
    provider = FasterWhisperProvider("base", "cpu")
    result = provider.transcribe(audio, "en")
    assert isinstance(result.text, str)
    assert result.language == "en"
    assert result.duration_seconds and result.duration_seconds > 0
