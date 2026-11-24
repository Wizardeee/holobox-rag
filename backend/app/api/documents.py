"""Document management. All operations require teacher authorization.

Kiosk users have no document-management endpoint at all — not even a hidden one.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from app.core.auth import require_authenticated, require_teacher
from app.core.errors import AppError
from app.core.security import verify_token
from app.ingestion.ingestor import Ingestor
from app.models.schemas import (
    DeletedResponse,
    DocumentInfo,
    DocumentUpdate,
    Scope,
)
from app.services.dependencies import get_ingestor, get_repository, get_vector_store
from app.services.repository import Repository, utcnow
from app.vector_db.base import VectorStore

router = APIRouter(
    prefix="/api/v1/documents",
    tags=["documents"],
    dependencies=[Depends(verify_token)],
)


def _check_course(principal, course_id: str, repository: Repository) -> None:
    if principal.course_ids is not None and course_id not in principal.course_ids:
        raise AppError("forbidden", "Course is not permitted", 403)
    if repository.get_course(course_id) is None:
        raise AppError("course_not_found", "Course not found", 404)


def _check_subject(repository: Repository, course_id: str, subject_id: str | None) -> None:
    if subject_id and not any(
        item["id"] == subject_id for item in repository.list_subjects(course_id)
    ):
        raise AppError("subject_not_found", "Subject not found in this course", 404)


@router.post("", response_model=DocumentInfo, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    scope: Scope = Form(Scope.USER),
    course_id: str = Form("general"),
    subject_id: str | None = Form(None),
    approved: bool = Form(True),
    teacher=Depends(require_teacher),
    ingestor: Ingestor = Depends(get_ingestor),
    repository: Repository = Depends(get_repository),
) -> DocumentInfo:
    _check_course(teacher, course_id, repository)
    _check_subject(repository, course_id, subject_id)
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
    return ingestor.ingest(
        file.filename or "upload",
        content,
        scope,
        teacher.user_id,
        course_id=course_id,
        subject_id=subject_id,
        approved=approved,
        uploader=teacher.display_name,
    )


@router.get("", response_model=list[DocumentInfo])
def list_documents(
    course_id: str | None = None,
    subject_id: str | None = None,
    principal=Depends(require_authenticated),
    repository: Repository = Depends(get_repository),
) -> list[DocumentInfo]:
    course = course_id or (next(iter(principal.course_ids)) if principal.course_ids and len(principal.course_ids) == 1 else None)
    if course:
        _check_course(principal, course, repository)
    elif principal.course_ids is not None:
        raise AppError("course_required", "Select a course", 400)
    return repository.list_documents(
        None,  # access is role/course/approval based, not per-user ownership
        course_id=course,
        subject_id=subject_id,
        approved_only=principal.role == "kiosk",
    )


@router.get("/{document_id}", response_model=DocumentInfo)
def get_document(
    document_id: str,
    principal=Depends(require_authenticated),
    repository: Repository = Depends(get_repository),
) -> DocumentInfo:
    document = repository.get_document(document_id)
    if document is None:
        raise AppError("document_not_found", "Document not found", 404)
    if principal.role == "kiosk":
        _check_course(principal, document.course_id, repository)
        if not document.approved or document.status != "ready":
            raise AppError("document_not_available", "Document is not available", 403)
    return document


@router.patch("/{document_id}", response_model=DocumentInfo)
def update_document(
    document_id: str,
    request: DocumentUpdate,
    _teacher=Depends(require_teacher),
    repository: Repository = Depends(get_repository),
) -> DocumentInfo:
    document = repository.get_document(document_id)
    if document is None:
        raise AppError("document_not_found", "Document not found", 404)
    fields = {}
    if request.approved is not None:
        fields["approved"] = int(request.approved)
    if request.subject_id is not None:
        _check_subject(repository, document.course_id, request.subject_id)
        fields["subject_id"] = request.subject_id
    if fields:
        fields["updated_at"] = utcnow()
        repository.update_document(document_id, **fields)
    return repository.get_document(document_id)  # type: ignore[return-value]


@router.post("/{document_id}/reindex", response_model=DocumentInfo)
def reindex_document(
    document_id: str,
    _teacher=Depends(require_teacher),
    ingestor: Ingestor = Depends(get_ingestor),
    repository: Repository = Depends(get_repository),
) -> DocumentInfo:
    document = repository.get_document(document_id)
    if document is None:
        raise AppError("document_not_found", "Document not found", 404)
    try:
        ingestor.reindex(document_id)
    except Exception as exc:
        raise AppError("reindex_failed", f"Re-indexing failed: {exc}", 500)
    return repository.get_document(document_id)  # type: ignore[return-value]


@router.post("/{document_id}/replace", response_model=DocumentInfo, status_code=status.HTTP_201_CREATED)
async def replace_document(
    document_id: str,
    file: UploadFile = File(...),
    teacher=Depends(require_teacher),
    ingestor: Ingestor = Depends(get_ingestor),
    repository: Repository = Depends(get_repository),
    vector_store: VectorStore = Depends(get_vector_store),
) -> DocumentInfo:
    existing = repository.get_document(document_id)
    if existing is None:
        raise AppError("document_not_found", "Document not found", 404)
    content = await file.read()
    try:
        ingestor.validate(file.filename or "upload", content)
    except ValueError as exc:
        raise AppError("invalid_file", str(exc), 400)
    vector_store.delete_document(document_id)
    ingestor.delete_files(document_id)
    repository.delete_document(document_id)
    return ingestor.ingest(
        file.filename or "upload",
        content,
        existing.scope,
        teacher.user_id,
        course_id=existing.course_id,
        subject_id=existing.subject_id,
        approved=existing.approved,
        uploader=teacher.display_name,
    )


@router.delete("/{document_id}", response_model=DeletedResponse)
def delete_document(
    document_id: str,
    _teacher=Depends(require_teacher),
    repository: Repository = Depends(get_repository),
    ingestor: Ingestor = Depends(get_ingestor),
    vector_store: VectorStore = Depends(get_vector_store),
) -> DeletedResponse:
    if repository.get_document(document_id) is None:
        raise AppError("document_not_found", "Document not found", 404)
    vector_store.delete_document(document_id)
    ingestor.delete_files(document_id)
    repository.delete_document(document_id)
    return DeletedResponse(deleted=True)
