"""Course creation must be visible to the kiosk without weakening role checks."""

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.auth import hash_password
from app.core.config import get_settings
from tests.fakes import FakeEmbedder, FakeLLMProvider, FakeSTTProvider, FakeTTSService, FakeVectorStore

TEACHER_PASSWORD = "test-teacher-password"
KIOSK_TOKEN = "test-kiosk-token"
NEW_COURSE = {"id": "course-sync-test", "name": "Holobox Course Sync Test 2026"}


@pytest.fixture
def course_client(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_AUTH_ENABLED", "true")
    monkeypatch.setenv("HOLOBOX_TEACHER_USERNAME", "teacher")
    monkeypatch.setenv("HOLOBOX_TEACHER_PASSWORD_HASH", hash_password(TEACHER_PASSWORD))
    monkeypatch.setenv("HOLOBOX_KIOSK_TOKEN", KIOSK_TOKEN)
    monkeypatch.delenv("HOLOBOX_KIOSK_COURSES", raising=False)
    monkeypatch.setenv("HOLOBOX_LLM_PROVIDER", "mock")
    monkeypatch.delenv("HOLOBOX_API_TOKEN", raising=False)
    monkeypatch.setattr(main_module, "create_embedder", lambda settings: FakeEmbedder())
    monkeypatch.setattr(main_module, "create_vector_store", lambda settings: FakeVectorStore())
    monkeypatch.setattr(main_module, "create_llm_provider", lambda settings: FakeLLMProvider())
    monkeypatch.setattr(main_module, "create_stt_provider", lambda settings: FakeSTTProvider())
    monkeypatch.setattr(main_module, "create_tts_service", lambda settings: FakeTTSService())
    get_settings.cache_clear()
    app = main_module.create_app()
    with TestClient(app) as client:
        yield client
    get_settings.cache_clear()


def _teacher(client):
    token = client.post(
        "/api/v1/auth/login", json={"username": "teacher", "password": TEACHER_PASSWORD}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _kiosk():
    return {"Authorization": f"Bearer {KIOSK_TOKEN}"}


def test_teacher_creates_course_and_kiosk_sees_it(course_client):
    teacher = _teacher(course_client)
    kiosk = _kiosk()

    before = [item["id"] for item in course_client.get("/api/v1/courses", headers=kiosk).json()]
    assert NEW_COURSE["id"] not in before

    response = course_client.post("/api/v1/courses", json=NEW_COURSE, headers=teacher)
    assert response.status_code == 201
    assert response.json()["id"] == NEW_COURSE["id"]
    assert response.json()["name"] == NEW_COURSE["name"]
    assert response.json()["active"] is True

    # Kiosk course-list endpoint is a fresh query on every call.
    after = course_client.get("/api/v1/courses", headers=kiosk).json()
    assert NEW_COURSE["id"] in [item["id"] for item in after]

    # Persisted in SQLite, not only held in memory.
    from app.core.config import get_settings

    settings = get_settings()
    row = course_client.app.state.repository.get_course(NEW_COURSE["id"])
    assert row is not None and row["active"] is True
    assert settings.database_path.exists()


def test_kiosk_cannot_create_course(course_client):
    response = course_client.post("/api/v1/courses", json=NEW_COURSE, headers=_kiosk())
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


def test_kiosk_cannot_create_subject(course_client):
    response = course_client.post(
        f"/api/v1/courses/{NEW_COURSE['id']}/subjects",
        json={"id": "s1", "name": "Subject 1"},
        headers=_kiosk(),
    )
    assert response.status_code == 403


def test_duplicate_course_creation_is_rejected(course_client):
    teacher = _teacher(course_client)
    assert course_client.post("/api/v1/courses", json=NEW_COURSE, headers=teacher).status_code == 201
    duplicate = course_client.post("/api/v1/courses", json=NEW_COURSE, headers=teacher)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "course_exists"
