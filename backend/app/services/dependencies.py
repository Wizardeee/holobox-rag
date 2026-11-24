"""FastAPI dependencies that expose app-scoped services."""

from fastapi import Request

from app.core.config import Settings, get_settings
from app.ingestion.ingestor import Ingestor
from app.services.repository import Repository


def settings_dependency() -> Settings:
    return get_settings()


def get_repository(request: Request) -> Repository:
    return request.app.state.repository


def get_ingestor(request: Request) -> Ingestor:
    return request.app.state.ingestor
