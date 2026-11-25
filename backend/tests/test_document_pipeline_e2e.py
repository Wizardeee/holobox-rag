"""End-to-end pipeline tests: upload -> extract -> embed -> index -> ready."""

import pytest

from tests.helpers import make_pdf

UNIQUE = "Project Orion test fact 37.6 degrees Celsius ZEBRA-7744"
CONTENT = f"Orion Lab Note\n\n{UNIQUE}\n\nOnly this document contains ZEBRA-7744.\n".encode()


def _upload(client, content=CONTENT, name="orion.txt", approved=True):
    return client.post(
        "/api/v1/documents",
        files={"file": (name, content, "text/plain")},
        data={"course_id": "gpu-architecture", "approved": str(approved).lower()},
        headers={"X-User-Id": "teacher"},
    )


def test_upload_indexes_all_chunks_and_marks_ready(client):
    response = _upload(client)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "ready"
    assert body["chunk_count"] >= 1
    assert body["indexed_chunks"] == body["chunk_count"]
    assert body["error"] is None

    rows = client.app.state.vector_store.rows
    assert len(rows) == body["chunk_count"]
    assert all(row["chunk"].document_id == body["id"] for row in rows)


def test_reupload_updates_approval_without_duplicate_vectors(client):
    first = _upload(client, approved=False).json()
    assert first["approved"] is False
    assert first["indexed_chunks"] == first["chunk_count"]
    rows_after_first = len(client.app.state.vector_store.rows)

    second = _upload(client, name="orion_v2.txt", approved=True).json()
    assert second["id"] == first["id"]
    assert second["approved"] is True
    assert second["name"] == "orion_v2.txt"
    assert second["indexed_chunks"] == second["chunk_count"]
    assert len(client.app.state.vector_store.rows) == rows_after_first

    stored = client.get(f"/api/v1/documents/{first['id']}", headers={"X-User-Id": "teacher"}).json()
    assert stored["approved"] is True


def test_embedding_failure_never_marks_document_ready(client, monkeypatch):
    embedder = client.app.state.ingestor.indexer.embedder

    def boom(_texts):
        raise RuntimeError("embedding service unavailable")

    monkeypatch.setattr(embedder, "embed", boom)
    response = _upload(client)
    body = response.json()
    assert body["status"] == "failed"
    assert body["indexed_chunks"] == 0
    assert "embedding service unavailable" in body["error"]
    assert client.app.state.vector_store.rows == []


def test_retry_after_failure_succeeds_without_duplicates(client, monkeypatch):
    embedder = client.app.state.ingestor.indexer.embedder
    original = embedder.embed

    def boom(_texts):
        raise RuntimeError("temporary embedding failure")

    monkeypatch.setattr(embedder, "embed", boom)
    failed = _upload(client).json()
    assert failed["status"] == "failed"

    monkeypatch.setattr(embedder, "embed", original)
    retried = client.post(
        f"/api/v1/documents/{failed['id']}/reindex",
        headers={"X-User-Id": "teacher"},
    )
    assert retried.status_code == 200
    body = retried.json()
    assert body["status"] == "ready"
    assert body["indexed_chunks"] == body["chunk_count"]
    assert len(client.app.state.vector_store.rows) == body["chunk_count"]


def test_new_document_is_retrievable_by_student_query(client):
    uploaded = _upload(client).json()
    response = client.post(
        "/api/v1/query",
        json={
            "question": "What is the Orion test fact ZEBRA-7744?",
            "course_id": "gpu-architecture",
            "owner_id": "kiosk",
            "include_sources": True,
        },
        headers={"X-User-Id": "kiosk"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["retrieved_context_available"] is True
    assert any(source["document_id"] == uploaded["id"] for source in body["sources"])
    assert any("ZEBRA-7744" in source["excerpt"] for source in body["sources"])


def test_reindex_reextracts_and_replaces_legacy_bad_chunks(client):
    uploaded = client.post(
        "/api/v1/documents",
        files={"file": ("spaced.pdf", make_pdf(["H e l l o  W o r l d ."]), "application/pdf")},
        data={"course_id": "gpu-architecture", "approved": "true"},
        headers={"X-User-Id": "teacher"},
    ).json()
    document_id = uploaded["id"]
    repository = client.app.state.repository

    # Simulate a legacy document whose stored chunks were extracted badly.
    repository.delete_chunks(document_id)
    repository.add_chunks(document_id, [("legacy-chunk", 1, "H e l l o  W o r l d .")])

    response = client.post(
        f"/api/v1/documents/{document_id}/reindex",
        headers={"X-User-Id": "teacher"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["indexed_chunks"] == body["chunk_count"]
    assert body["approved"] is True and body["course_id"] == "gpu-architecture"

    chunks = repository.get_chunks(document_id)
    assert len(chunks) == body["chunk_count"]
    assert "Hello World." in chunks[0]["text"]
    assert "H e l l o" not in chunks[0]["text"]
    assert len(client.app.state.vector_store.rows) == len(chunks)
