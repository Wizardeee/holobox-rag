"""Text RAG query endpoint."""

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.security import current_user, verify_token
from app.models.schemas import QueryRequest, QueryResponse
from app.rag.pipeline import RAGPipeline
from app.services.dependencies import get_pipeline

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])


@router.post("/query", response_model=QueryResponse)
def query(
    request: QueryRequest,
    owner: str = Depends(current_user),
    pipeline: RAGPipeline = Depends(get_pipeline),
) -> QueryResponse:
    if request.owner_id != owner:
        raise AppError("forbidden", "owner_id must match X-User-Id", 403)
    return pipeline.run(request)
