"""Optional bearer-token protection and requester identity.

X-User-Id is an identity hint for ownership filtering, not a credential.
"""

from fastapi import Header, HTTPException

from app.core.config import get_settings


def verify_token(authorization: str | None = Header(default=None)) -> None:
    configured = get_settings().api_token
    if configured and authorization != f"Bearer {configured}":
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "message": "A valid bearer token is required"},
            headers={"WWW-Authenticate": "Bearer"},
        )


def current_user(x_user_id: str = Header(default="local-user", alias="X-User-Id")) -> str:
    user_id = (x_user_id or "").strip()
    if not user_id or len(user_id) > 128:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_user", "message": "X-User-Id must be between 1 and 128 characters"},
        )
    return user_id
