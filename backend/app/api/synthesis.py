"""Audio synthesis endpoint usable by the desktop app and future avatar clients."""

from fastapi import APIRouter, Depends, Response
from fastapi.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.core.security import current_user, verify_token
from app.models.schemas import SynthesisRequest
from app.services.dependencies import get_tts_service
from app.text_to_speech.base import TTSService, TTSUnavailableError

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])


@router.post("/synthesize")
async def synthesize(
    request: SynthesisRequest,
    _owner: str = Depends(current_user),
    service: TTSService = Depends(get_tts_service),
) -> Response:
    try:
        audio = await run_in_threadpool(service.synthesize, request.text, request.voice)
    except TTSUnavailableError as exc:
        raise AppError(exc.code, str(exc), 503)
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})
