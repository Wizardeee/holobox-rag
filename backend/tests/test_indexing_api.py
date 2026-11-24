from app.models.schemas import Scope


def _upload(client, filename, content, user="alice", scope=Scope.USER):
    return client.post(
        "/api/v1/documents",
        files={"file": (filename, content, "text/plain")},
        data={"scope": scope.value},
        headers={"X-User-Id": user},
    )


def test_upload_indexes_and_delete_removes_vectors(client):
    document = _upload(client, "notes.txt", b"cloud computing lecture notes").json()
    store = client.app.state.vector_store
    assert store.count() > 0

    embedder = client.app.state.embedder
    hits = store.search(embedder.embed(["cloud computing"])[0], top_k=5)
    assert any(hit.document_id == document["id"] for hit in hits)

    client.delete(f"/api/v1/documents/{document['id']}", headers={"X-User-Id": "alice"})
    assert store.count() == 0


def test_vector_metadata_contains_ownership(client):
    document = _upload(client, "shared.txt", b"shared policy handbook", scope=Scope.SHARED).json()
    row = client.app.state.vector_store.rows[0]
    assert row["chunk"].document_id == document["id"]
    assert row["chunk"].owner_id == "alice"
    assert row["chunk"].scope == "shared"
