"""Capability discovery for the desktop client and future avatar clients."""

from fastapi import APIRouter, Depends, Request

from app.core.config import Settings, get_settings
from app.core.security import verify_token
from app.models.schemas import CapabilitiesResponse

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])


@router.get("/config/capabilities", response_model=CapabilitiesResponse)
def capabilities(request: Request, settings: Settings = Depends(get_settings)) -> CapabilitiesResponse:
    provider = request.app.state.llm_provider
    tts_service = getattr(request.app.state, "tts_service", None)
    voices = tts_service.list_voices() if tts_service is not None else []
    return CapabilitiesResponse(
        providers=["mock", "http", "college", "none"],
        active_provider=provider.id,
        llm_configured=provider.is_configured,
        embedding_model=settings.embedding_model,
        stt_models=["tiny", "base", "small", "medium"],
        tts_voices=voices,
        voice_input_enabled=True,
        voice_output_enabled=True,
    )
