"""Teacher login and identity endpoints."""

from fastapi import APIRouter, Depends

from app.core.auth import authenticate_teacher, create_token, require_authenticated
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.models.schemas import LoginRequest, LoginResponse, PrincipalInfo, Role

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, settings: Settings = Depends(get_settings)) -> LoginResponse:
    principal = authenticate_teacher(request.username, request.password, settings)
    if principal is None:
        raise AppError("invalid_credentials", "Invalid username or password", 401)
    token = create_token(principal, settings.auth_secret, settings.token_ttl_seconds)
    return LoginResponse(access_token=token, role=Role.TEACHER, display_name=principal.display_name)


@router.get("/me", response_model=PrincipalInfo)
def me(principal=Depends(require_authenticated)) -> PrincipalInfo:
    return PrincipalInfo(
        user_id=principal.user_id,
        role=Role(principal.role),
        display_name=principal.display_name,
        permitted_courses=sorted(principal.course_ids) if principal.course_ids is not None else None,
    )
