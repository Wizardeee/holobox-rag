"""Single source of truth for the API contract.

FastAPI derives OpenAPI from these models; frontend TypeScript types are generated
from that schema. Do not duplicate these shapes in TypeScript by hand.
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GenerationMode(str, Enum):
    MOCK = "mock"
    LIVE = "live"
    UNAVAILABLE = "unavailable"


class DocumentStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Scope(str, Enum):
    SHARED = "shared"
    USER = "user"


class DocumentInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    scope: Scope
    owner_id: str
    status: DocumentStatus
    size_bytes: int
    sha256: str
    page_count: int | None = None
    chunk_count: int = 0
    error: str | None = None
    created_at: datetime


class SourceReference(BaseModel):
    document_id: str
    document_name: str
    page_number: int | None = None
    excerpt: str
    score: float


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    owner_id: str = Field(default="local-user", min_length=1, max_length=128)
    conversation_id: str | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    include_sources: bool = True


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceReference]
    generation_mode: GenerationMode
    conversation_id: str | None = None
    retrieved_context_available: bool
    warning: str | None = None


class TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
    duration_seconds: float | None = None


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    voice: str | None = None


class ConversationCreate(BaseModel):
    owner_id: str = Field(default="local-user", min_length=1, max_length=128)
    title: str | None = Field(default=None, max_length=200)


class MessageInfo(BaseModel):
    id: str
    role: str
    content: str
    sources: list[SourceReference] = Field(default_factory=list)
    created_at: datetime


class Conversation(BaseModel):
    id: str
    owner_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageInfo]


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int


class CapabilitiesResponse(BaseModel):
    providers: list[str]
    active_provider: str
    llm_configured: bool
    embedding_model: str
    stt_models: list[str]
    tts_voices: list[str]
    voice_input_enabled: bool
    voice_output_enabled: bool


class HealthResponse(BaseModel):
    status: str
    version: str
    capabilities: dict[str, Any]


class DeletedResponse(BaseModel):
    deleted: bool


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    detail: ErrorDetail
