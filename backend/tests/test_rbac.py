"""Role-based access and course-scoped retrieval with real authentication."""

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.auth import hash_password
from app.core.config import get_settings
from tests.fakes import FakeEmbedder, FakeLLMProvider, FakeSTTProvider, FakeTTSService, FakeVectorStore

TEACHER_PASSWORD = "test-teacher-password"
KIOSK_TOKEN = "test-kiosk-token"


@pytest.fixture
def secure_client(tmp_path, monkeypatch):
    monkeypatch.setenv("HOLOBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HOLOBOX_AUTH_ENABLED", "true")
    monkeypatch.setenv("HOLOBOX_TEACHER_USERNAME", "teacher")
    monkeypatch.setenv("HOLOBOX_TEACHER_PASSWORD_HASH", hash_password(TEACHER_PASSWORD))
    monkeypatch.setenv("HOLOBOX_KIOSK_TOKEN", KIOSK_TOKEN)
    monkeypatch.setenv("HOLOBOX_KIOSK_COURSES", "gpu-architecture")
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


def _teacher(secure_client):
    response = secure_client.post(
        "/api/v1/auth/login", json={"username": "teacher", "password": TEACHER_PASSWORD}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _kiosk():
    return {"Authorization": f"Bearer {KIOSK_TOKEN}"}


def _upload(secure_client, teacher, filename, content, *, course="gpu-architecture", approved=True):
    return secure_client.post(
        "/api/v1/documents",
        files={"file": (filename, content, "text/plain")},
        data={"course_id": course, "approved": str(approved).lower()},
        headers=teacher,
    )


def test_teacher_login(secure_client):
    assert secure_client.post(
        "/api/v1/auth/login", json={"username": "teacher", "password": "wrong"}
    ).status_code == 401
    body = secure_client.post(
        "/api/v1/auth/login", json={"username": "teacher", "password": TEACHER_PASSWORD}
    ).json()
    assert body["role"] == "teacher" and body["access_token"]
    me = secure_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["role"] == "teacher"


def test_x_user_id_cannot_impersonate(secure_client):
    response = secure_client.get("/api/v1/documents", headers={"X-User-Id": "teacher"})
    assert response.status_code == 401


def test_kiosk_cannot_manage_documents(secure_client):
    teacher = _teacher(secure_client)
    document = _upload(secure_client, teacher, "notes.txt", b"gpu architecture notes").json()
    kiosk = _kiosk()

    file = {"file": ("evil.txt", b"evil", "text/plain")}
    assert secure_client.post("/api/v1/documents", files=file, data={"course_id": "gpu-architecture"}, headers=kiosk).status_code == 403
    assert secure_client.delete(f"/api/v1/documents/{document['id']}", headers=kiosk).status_code == 403
    assert secure_client.post(f"/api/v1/documents/{document['id']}/reindex", headers=kiosk).status_code == 403
    assert secure_client.patch(f"/api/v1/documents/{document['id']}", json={"approved": False}, headers=kiosk).status_code == 403
    assert secure_client.post(
        f"/api/v1/documents/{document['id']}/replace", files=file, headers=kiosk
    ).status_code == 403
    assert secure_client.get("/api/v1/courses", headers=kiosk).json()[0]["id"] == "gpu-architecture"


def test_kiosk_query_is_course_scoped_and_approval_filtered(secure_client):
    teacher = _teacher(secure_client)
    _upload(secure_client, teacher, "approved.txt", b"cuda gpu architecture revision notes")
    _upload(secure_client, teacher, "draft.txt", b"secret draft exam answers", approved=False)
    _upload(secure_client, teacher, "other.txt", b"world history revision notes", course="general")
    kiosk = _kiosk()

    assert secure_client.post(
        "/api/v1/query", json={"question": "revision notes"}, headers=kiosk
    ).status_code == 400

    forbidden = secure_client.post(
        "/api/v1/query",
        json={"question": "revision notes", "course_id": "general"},
        headers=kiosk,
    )
    assert forbidden.status_code == 403

    response = secure_client.post(
        "/api/v1/query",
        json={"question": "cuda gpu architecture revision notes", "course_id": "gpu-architecture"},
        headers=kiosk,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "mock"
    names = {source["document_name"] for source in body["sources"]}
    assert "approved.txt" in names
    assert "draft.txt" not in names and "other.txt" not in names

    docs = secure_client.get("/api/v1/documents?course_id=gpu-architecture", headers=kiosk).json()
    assert [item["name"] for item in docs] == ["approved.txt"]


def test_document_reindex_approve_and_replace(secure_client):
    teacher = _teacher(secure_client)
    document = _upload(secure_client, teacher, "old.txt", b"old revision notes").json()
    assert document["status"] == "ready"

    reindexed = secure_client.post(f"/api/v1/documents/{document['id']}/reindex", headers=teacher)
    assert reindexed.status_code == 200 and reindexed.json()["chunk_count"] >= 1

    unapproved = secure_client.patch(
        f"/api/v1/documents/{document['id']}", json={"approved": False}, headers=teacher
    )
    assert unapproved.status_code == 200 and unapproved.json()["approved"] is False

    replaced = secure_client.post(
        f"/api/v1/documents/{document['id']}/replace",
        files={"file": ("new.txt", b"new approved revision notes", "text/plain")},
        headers=teacher,
    )
    assert replaced.status_code == 201
    assert replaced.json()["name"] == "new.txt"
    assert replaced.json()["approved"] is False  # association preserved
    assert secure_client.get(f"/api/v1/documents/{document['id']}", headers=teacher).status_code == 404


def test_approval_and_course_isolation_for_new_document(secure_client):
    teacher = _teacher(secure_client)
    kiosk = _kiosk()
    unique = "ZEBRA-8842 uniquely indexed approval test"
    content = f"Approval test\n\n{unique}\n".encode()

    unapproved = secure_client.post(
        "/api/v1/documents",
        files={"file": ("approval.txt", content, "text/plain")},
        data={"course_id": "gpu-architecture", "approved": "false"},
        headers=teacher,
    ).json()
    question = "What is ZEBRA-8842?"
    q = secure_client.post(
        "/api/v1/query",
        json={"question": question, "course_id": "gpu-architecture", "owner_id": "kiosk"},
        headers=kiosk,
    ).json()
    assert unapproved["approved"] is False
    assert all(s["document_id"] != unapproved["id"] for s in q.get("sources", []))

    approved = secure_client.patch(
        f"/api/v1/documents/{unapproved['id']}", json={"approved": True}, headers=teacher
    ).json()
    assert approved["approved"] is True
    q = secure_client.post(
        "/api/v1/query",
        json={"question": question, "course_id": "gpu-architecture", "owner_id": "kiosk"},
        headers=kiosk,
    ).json()
    assert any(s["document_id"] == unapproved["id"] for s in q.get("sources", []))

    other = secure_client.post(
        "/api/v1/query",
        json={"question": question, "course_id": "general", "owner_id": "kiosk"},
        headers=kiosk,
    )
    assert other.status_code == 403  # kiosk credential is restricted to one course


def test_reupload_same_content_can_hide_document_from_kiosk(secure_client):
    teacher = _teacher(secure_client)
    kiosk = _kiosk()
    content = b"HIDDEN-5193 same bytes reuploaded with approval removed"
    first = secure_client.post(
        "/api/v1/documents",
        files={"file": ("hidden.txt", content, "text/plain")},
        data={"course_id": "gpu-architecture", "approved": "true"},
        headers=teacher,
    ).json()
    second = secure_client.post(
        "/api/v1/documents",
        files={"file": ("hidden.txt", content, "text/plain")},
        data={"course_id": "gpu-architecture", "approved": "false"},
        headers=teacher,
    ).json()
    assert second["id"] == first["id"]
    assert second["approved"] is False
    question = "What is HIDDEN-5193?"
    q = secure_client.post(
        "/api/v1/query",
        json={"question": question, "course_id": "gpu-architecture", "owner_id": "kiosk"},
        headers=kiosk,
    ).json()
    assert all(s["document_id"] != first["id"] for s in q.get("sources", []))
