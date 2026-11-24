"""Course-authorised RAG query endpoint."""

from fastapi import APIRouter, Depends

from app.core.auth import require_authenticated
from app.core.errors import AppError
from app.core.security import verify_token
from app.models.schemas import QueryRequest, QueryResponse
from app.rag.pipeline import RAGPipeline
from app.services.dependencies import get_pipeline, get_repository
from app.services.repository import Repository

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])


@router.post("/query", response_model=QueryResponse)
def query(
    request: QueryRequest,
    principal=Depends(require_authenticated),
    pipeline: RAGPipeline = Depends(get_pipeline),
    repository: Repository = Depends(get_repository),
) -> QueryResponse:
    course_id = request.course_id
    if principal.course_ids is not None:
        if not course_id:
            raise AppError("course_required", "Select a permitted course", 400)
        if course_id not in principal.course_ids:
            raise AppError("forbidden", "Course is not permitted for this kiosk", 403)
    if course_id and repository.get_course(course_id) is None:
        raise AppError("course_not_found", "Course not found", 404)
    if course_id and request.subject_id:
        if not any(s["id"] == request.subject_id for s in repository.list_subjects(course_id)):
            raise AppError("subject_not_found", "Subject not found in this course", 404)
    return pipeline.run(request, principal=principal, course_id=course_id)
