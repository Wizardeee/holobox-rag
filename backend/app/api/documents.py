"""Document upload, listing, metadata and deletion with ownership enforcement."""

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from app.core.errors import AppError
from app.core.security import current_user, verify_token
from app.ingestion.ingestor import Ingestor
from app.models.schemas import DeletedResponse, DocumentInfo, Scope
from app.services.dependencies import get_ingestor, get_repository
from app.services.repository import Repository

router = APIRouter(
    prefix="/api/v1/documents",
    tags=["documents"],
    dependencies=[Depends(verify_token)],
)


@router.post("", response_model=DocumentInfo, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    scope: Scope = Form(Scope.USER),
    owner: str = Depends(current_user),
    ingestor: Ingestor = Depends(get_ingestor),
) -> DocumentInfo:
    content = await file.read()
    try:
        ingestor.validate(file.filename or "upload", content)
    except ValueError as exc:
        message = str(exc)
        if message.startswith("Unsupported"):
            raise AppError("unsupported_type", message, 415)
        if message.startswith("File exceeds"):
            raise AppError("file_too_large", message, 413)
        raise AppError("invalid_file", message, 400)
    return ingestor.ingest(file.filename or "upload", content, scope, owner)


@router.get("", response_model=list[DocumentInfo])
def list_documents(
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
) -> list[DocumentInfo]:
    return repository.list_documents(owner)


def _get_visible(document_id: str, owner: str, repository: Repository, *, write: bool) -> DocumentInfo:
    document = repository.get_document(document_id)
    if document is None:
        raise AppError("document_not_found", "Document not found", 404)
    if document.scope == Scope.SHARED and not write:
        return document
    if document.owner_id != owner:
        raise AppError("forbidden", "You do not have access to this document", 403)
    return document


@router.get("/{document_id}", response_model=DocumentInfo)
def get_document(
    document_id: str,
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
) -> DocumentInfo:
    return _get_visible(document_id, owner, repository, write=False)


@router.delete("/{document_id}", response_model=DeletedResponse)
def delete_document(
    document_id: str,
    owner: str = Depends(current_user),
    repository: Repository = Depends(get_repository),
    ingestor: Ingestor = Depends(get_ingestor),
) -> DeletedResponse:
    _get_visible(document_id, owner, repository, write=True)
    vector_store = getattr(repository, "vector_store", None)
    if vector_store is not None:
        vector_store.delete_document(document_id)
    ingestor.delete_files(document_id)
    repository.delete_document(document_id)
    return DeletedResponse(deleted=True)
