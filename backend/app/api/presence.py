"""Camera-presence coordination and the five-second kiosk capture hand-off.

The backend never captures audio itself: the kiosk owns the microphone. These
endpoints coordinate the listening window, then reuse the existing transcribe,
RAG and Piper services so there is only one answer/voice flow.
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.core.auth import require_authenticated
from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import verify_token
from app.models.schemas import (
    PresenceDecision,
    PresenceEvent,
    QueryRequest,
    QueryResponse,
    VoiceCaptureResponse,
)
from app.rag.pipeline import RAGPipeline
from app.services.dependencies import (
    get_pipeline,
    settings_dependency,
    get_stt_provider,
    get_tts_service,
    get_voice_sessions,
)
from app.services.voice_sessions import VoiceSessionCoordinator
from app.speech_to_text.base import STTProvider
from app.text_to_speech.base import TTSService, TTSUnavailableError
from app.api.voice import ALLOWED_AUDIO, MAX_AUDIO_MB

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])
logger = logging.getLogger(__name__)


@router.post("/voice/presence", response_model=PresenceDecision)
def presence_event(
    event: PresenceEvent,
    _principal=Depends(require_authenticated),
    sessions: VoiceSessionCoordinator = Depends(get_voice_sessions),
    settings: Settings = Depends(settings_dependency),
) -> PresenceDecision:
    listen, session_id, reason = sessions.presence(event.present)
    return PresenceDecision(
        listen=listen,
        session_id=session_id if listen else None,
        listen_ms=settings.listen_window_ms,
        reason=reason,
    )


@router.post("/voice/capture", response_model=VoiceCaptureResponse)
async def capture_voice(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    language: str | None = Form(None),
    course_id: str | None = Form(None),
    conversation_id: str | None = Form(None),
    _principal=Depends(require_authenticated),
    sessions: VoiceSessionCoordinator = Depends(get_voice_sessions),
    settings: Settings = Depends(settings_dependency),
    stt: STTProvider = Depends(get_stt_provider),
    pipeline: RAGPipeline = Depends(get_pipeline),
    tts: TTSService = Depends(get_tts_service),
) -> VoiceCaptureResponse:
    if not sessions.begin_capture(session_id):
        raise AppError("invalid_listening_session", "No active listening session", 409)

    suffix = Path(audio.filename or "").suffix.lower()
    content = await audio.read()
    status = "error"
    warning: str | None = None
    text = ""
    answer = ""
    sources: list = []
    answer_source = "general_knowledge"
    document_support = "none"
    uncertain = False
    generation_mode = "unavailable"
    audio_base64: str | None = None
    temporary: Path | None = None

    try:
        if suffix not in ALLOWED_AUDIO:
            warning = "unsupported_audio_type"
        elif not content:
            warning = "empty_audio"
        elif len(content) > MAX_AUDIO_MB * 1024 * 1024:
            warning = "audio_too_large"
        else:
            temporary = settings.tmp_dir / f"{uuid4().hex}{suffix}"
            temporary.write_bytes(content)
            try:
                result = await run_in_threadpool(stt.transcribe, temporary, language or settings.stt_language)
                text = result.text.strip()
            except Exception as exc:
                warning = f"transcription_failed: {type(exc).__name__}"
                logger.warning("%s: %s", warning, exc)
            if not warning:
                if not text:
                    status = "no_speech"
                else:
                    request = QueryRequest(
                        question=text,
                        owner_id=_principal.user_id,
                        conversation_id=conversation_id,
                        top_k=None,
                        include_sources=True,
                        course_id=course_id,
                    )
                    try:
                        response: QueryResponse = await run_in_threadpool(
                            pipeline.run, request, principal=_principal, course_id=course_id
                        )
                        answer = response.answer
                        sources = response.sources
                        answer_source = response.answer_source.value
                        document_support = response.document_support.value
                        uncertain = response.uncertain
                        generation_mode = response.generation_mode.value
                        warning = response.warning
                        status = "answered"
                    except Exception as exc:
                        warning = f"generation_failed: {type(exc).__name__}"
                        logger.warning("%s: %s", warning, exc)
                    # TTS is optional: a failed voice must not erase the text answer.
                    if answer:
                        try:
                            wav = await run_in_threadpool(tts.synthesize, answer, None)
                            audio_base64 = base64.b64encode(wav).decode("ascii")
                        except TTSUnavailableError as exc:
                            warning = warning or exc.code
                        except Exception as exc:
                            warning = warning or f"tts_failed: {type(exc).__name__}"
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        sessions.finish(session_id, ok=status in {"answered", "no_speech"})

    return VoiceCaptureResponse(
        session_id=session_id,
        status=status,
        text=text,
        answer=answer,
        sources=sources,
        answer_source=answer_source,
        document_support=document_support,
        uncertain=uncertain,
        generation_mode=generation_mode,
        warning=warning,
        audio_base64=audio_base64,
    )

