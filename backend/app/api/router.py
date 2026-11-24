"""Aggregate v1 API router. Protected routers add verify_token as a dependency."""

from fastapi import APIRouter, Depends

from app.core.security import verify_token

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])
