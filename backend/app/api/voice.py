"""Audio transcription endpoint. Usable by the desktop app and future avatar clients."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.core.config import Settings
from app.core.errors import AppError
from app.core.auth import require_authenticated
from app.core.security import verify_token
from app.models.schemas import TranscriptionResponse
from app.services.dependencies import get_stt_provider, settings_dependency
from app.speech_to_text.base import STTProvider

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])
ALLOWED_AUDIO = {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4", ".flac"}
MAX_AUDIO_MB = 25


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str | None = Form(None),
    _principal=Depends(require_authenticated),
    settings: Settings = Depends(settings_dependency),
    provider: STTProvider = Depends(get_stt_provider),
) -> TranscriptionResponse:
    suffix = Path(audio.filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO:
        raise AppError("unsupported_audio_type", f"Unsupported audio type: {suffix or '(none)'}", 415)
    content = await audio.read()
    if not content:
        raise AppError("empty_audio", "Uploaded audio is empty", 400)
    if len(content) > MAX_AUDIO_MB * 1024 * 1024:
        raise AppError("audio_too_large", f"Audio exceeds the {MAX_AUDIO_MB} MB limit", 413)

    temporary = settings.tmp_dir / f"{uuid4().hex}{suffix}"
    temporary.write_bytes(content)
    try:
        result = await run_in_threadpool(provider.transcribe, temporary, language or settings.stt_language)
    except Exception as exc:
        raise AppError("transcription_failed", f"Transcription failed: {exc}", 500)
    finally:
        temporary.unlink(missing_ok=True)

    return TranscriptionResponse(
        text=result.text,
        language=result.language,
        duration_seconds=result.duration_seconds,
    )
