"""Locally stored conversation history with ownership enforcement."""

from uuid import uuid4

from fastapi import APIRouter, Depends, status

from app.core.errors import AppError
from app.core.security import current_user, verify_token
from app.models.schemas import (
    Conversation,
    ConversationCreate,
    ConversationSummary,
    DeletedResponse,
)
from app.services.dependencies import get_repository
from app.services.repository import Repository

router = APIRouter(prefix="/api/v1/conversations", dependencies=[Depends(verify_token)])


@router.get("", response_model=list[ConversationSummary])
def list_conversations(
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
) -> list[ConversationSummary]:
    return [ConversationSummary(**item) for item in repository.list_conversations(owner)]


@router.post("", response_model=Conversation, status_code=status.HTTP_201_CREATED)
def create_conversation(
    request: ConversationCreate,
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
) -> Conversation:
    if request.owner_id != owner:
        raise AppError("forbidden", "owner_id must match X-User-Id", 403)
    conversation_id = uuid4().hex
    repository.create_conversation(conversation_id, owner, request.title or "New conversation")
    return Conversation(**repository.get_conversation(conversation_id))  # type: ignore[arg-type]


def _owned(conversation_id: str, owner: str, repository: Repository) -> Conversation:
    conversation = repository.get_conversation(conversation_id)
    if conversation is None:
        raise AppError("conversation_not_found", "Conversation not found", 404)
    if conversation["owner_id"] != owner:
        raise AppError("forbidden", "You do not have access to this conversation", 403)
    return Conversation(**conversation)


@router.get("/{conversation_id}", response_model=Conversation)
def get_conversation(
    conversation_id: str,
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
) -> Conversation:
    return _owned(conversation_id, owner, repository)


@router.delete("/{conversation_id}", response_model=DeletedResponse)
def delete_conversation(
    conversation_id: str,
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
) -> DeletedResponse:
    _owned(conversation_id, owner, repository)
    repository.delete_conversation(conversation_id)
    return DeletedResponse(deleted=True)
