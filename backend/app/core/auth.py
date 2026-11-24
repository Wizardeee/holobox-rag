"""Proportionate MVP authentication: signed bearer tokens + PBKDF2 teacher passwords.

Identity and role come only from the token. X-User-Id is never used for auth.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.core.config import Settings, get_settings

ITERATIONS = 210_000


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str  # "teacher" | "kiosk"
    display_name: str
    course_ids: frozenset[str] | None = None  # None = every active course

    @property
    def is_teacher(self) -> bool:
        return self.role == "teacher"


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_token(principal: Principal, secret: str, ttl_seconds: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    payload = {
        "sub": principal.user_id,
        "role": principal.role,
        "name": principal.display_name,
        "courses": sorted(principal.course_ids) if principal.course_ids is not None else None,
        "exp": expires.isoformat(),
        "nonce": secrets.token_hex(8),
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def decode_token(token: str, secret: str) -> Principal:
    try:
        body, signature = token.split(".", 1)
        expected = _b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("bad signature")
        payload = json.loads(_b64decode(body))
        if datetime.fromisoformat(payload["exp"]) <= datetime.now(timezone.utc):
            raise ValueError("expired")
        courses = payload.get("courses")
        return Principal(
            user_id=payload["sub"],
            role=payload["role"],
            display_name=payload.get("name", payload["sub"]),
            course_ids=frozenset(courses) if courses is not None else None,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_credentials", "message": "Invalid or expired credentials"},
        ) from exc


def authenticate_teacher(username: str, password: str, settings: Settings) -> Principal | None:
    if not hmac.compare_digest(username, settings.teacher_username):
        return None
    if not verify_password(password, settings.teacher_password_hash):
        return None
    return Principal(user_id=f"teacher:{username}", role="teacher", display_name=settings.teacher_display_name)


def get_principal(
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    settings: Settings = Depends(get_settings),
) -> Principal:
    if not settings.auth_enabled:
        # Explicit development/testing mode only. Production refuses to start
        # with auth disabled (see config validation) and never trusts this header.
        return Principal(
            user_id=(x_user_id or "local-user").strip() or "local-user",
            role="teacher",
            display_name="Development Teacher",
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "message": "A bearer token is required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    if hmac.compare_digest(token, settings.kiosk_token):
        return Principal(
            user_id="kiosk:holobox",
            role="kiosk",
            display_name="Holobox Kiosk",
            course_ids=settings.kiosk_courses_set,
        )
    return decode_token(token, settings.auth_secret)


def require_teacher(principal: Principal = Depends(get_principal)) -> Principal:
    if not principal.is_teacher:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Teacher access required"},
        )
    return principal


def require_authenticated(principal: Principal = Depends(get_principal)) -> Principal:
    return principal
