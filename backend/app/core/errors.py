"""Uniform error envelope: {"detail": {"code": ..., "message": ...}}."""

import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _envelope(code: str, message: str) -> dict:
    return {"detail": {"code": code, "message": message}}


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=_envelope(exc.code, exc.message))


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        content = {"detail": detail}
    else:
        code = {404: "not_found", 401: "unauthorized", 403: "forbidden", 405: "method_not_allowed"}.get(
            exc.status_code, "http_error"
        )
        content = _envelope(code, str(detail))
    return JSONResponse(status_code=exc.status_code, content=content, headers=getattr(exc, "headers", None))


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    location = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
    message = f"Invalid request{': ' + location if location else ''}: {first.get('msg', 'validation error')}"
    return JSONResponse(status_code=422, content=_envelope("validation_error", message))


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled request error", exc_info=exc)
    return JSONResponse(status_code=500, content=_envelope("internal_error", "An internal error occurred"))


def install_error_handlers(app) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
