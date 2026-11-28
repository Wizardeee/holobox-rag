"""FastAPI dependencies that expose app-scoped services."""

from fastapi import Request

from app.core.config import Settings, get_settings
from app.ingestion.ingestor import Ingestor
from app.rag.pipeline import RAGPipeline
from app.services.repository import Repository
from app.services.voice_sessions import VoiceSessionCoordinator
from app.speech_to_text.base import STTProvider
from app.text_to_speech.base import TTSService
from app.vector_db.base import VectorStore


def settings_dependency() -> Settings:
    return get_settings()


def get_repository(request: Request) -> Repository:
    return request.app.state.repository


def get_ingestor(request: Request) -> Ingestor:
    return request.app.state.ingestor


def get_vector_store(request: Request) -> VectorStore:
    return request.app.state.vector_store


def get_pipeline(request: Request) -> RAGPipeline:
    return request.app.state.pipeline


def get_stt_provider(request: Request) -> STTProvider:
    return request.app.state.stt_provider


def get_tts_service(request: Request) -> TTSService:
    return request.app.state.tts_service


def get_voice_sessions(request: Request) -> VoiceSessionCoordinator:
    return request.app.state.voice_sessions
