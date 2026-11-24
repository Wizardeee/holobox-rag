"""Error-envelope and security unit tests.

Endpoint-level validation/token tests are added with the endpoints themselves
in later stages; nothing here relies on routes that do not exist yet.
"""

import asyncio
import json

import pytest
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import http_error_handler, validation_error_handler
from app.core.security import verify_token


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_validation_handler_envelope():
    exc = RequestValidationError(
        [{"loc": ("body", "question"), "msg": "field required", "type": "missing"}]
    )
    response = asyncio.run(validation_error_handler(None, exc))
    assert response.status_code == 422
    detail = json.loads(response.body)["detail"]
    assert detail["code"] == "validation_error"
    assert "question" in detail["message"]


def test_http_error_handler_preserves_custom_code():
    exc = StarletteHTTPException(status_code=403, detail={"code": "forbidden", "message": "no access"})
    response = asyncio.run(http_error_handler(None, exc))
    assert response.status_code == 403
    assert json.loads(response.body)["detail"]["code"] == "forbidden"


def test_verify_token_when_configured(tmp_path, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_API_TOKEN", "secret-token")
    get_settings.cache_clear()
    with pytest.raises(StarletteHTTPException) as missing:
        verify_token(None)
    assert missing.value.status_code == 401
    verify_token("Bearer secret-token")
    get_settings.cache_clear()


def test_verify_token_noop_when_unconfigured(client):
    verify_token(None)
