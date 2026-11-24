"""Health is intentionally unauthenticated for local smoke checks and canaries."""

from fastapi import APIRouter

from app import __version__
from app.core.config import get_settings
from app.models.schemas import HealthResponse

router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        version=__version__,
        capabilities={
            "active_provider": settings.llm_provider,
            "embedding_model": settings.embedding_model,
            "stt_model": settings.stt_model,
            "local_first": True,
        },
    )
