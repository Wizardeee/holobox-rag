from app.models.schemas import DocumentStatus, Scope


def _upload(client, filename="notes.txt", content=b"Cloud computing basics.", scope=Scope.USER, user="alice"):
    return client.post(
        "/api/v1/documents",
        files={"file": (filename, content, "text/plain")},
        data={"scope": scope.value},
        headers={"X-User-Id": user},
    )


def test_upload_list_and_delete(client, tmp_path):
    response = _upload(client)
    assert response.status_code == 201
    document = response.json()
    assert document["status"] == DocumentStatus.READY.value
    assert document["chunk_count"] >= 1
    assert document["owner_id"] == "alice"

    listed = client.get("/api/v1/documents", headers={"X-User-Id": "alice"}).json()
    assert [item["id"] for item in listed] == [document["id"]]

    assert (tmp_path / "data" / "uploads" / document["id"]).exists()
    deleted = client.delete(f"/api/v1/documents/{document['id']}", headers={"X-User-Id": "alice"})
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert client.get("/api/v1/documents", headers={"X-User-Id": "alice"}).json() == []
    assert not (tmp_path / "data" / "uploads" / document["id"]).exists()


def test_duplicate_upload_is_not_ingested_twice(client):
    first = _upload(client).json()
    second = _upload(client).json()
    assert first["id"] == second["id"]
    assert len(client.get("/api/v1/documents", headers={"X-User-Id": "alice"}).json()) == 1


def test_ownership_is_enforced(client):
    own = _upload(client, user="alice").json()
    shared = _upload(client, filename="shared.txt", scope=Scope.SHARED, user="alice").json()

    bob = {"X-User-Id": "bob"}
    visible = {item["id"] for item in client.get("/api/v1/documents", headers=bob).json()}
    assert shared["id"] in visible
    assert own["id"] not in visible

    assert client.get(f"/api/v1/documents/{own['id']}", headers=bob).status_code == 403
    assert client.delete(f"/api/v1/documents/{own['id']}", headers=bob).status_code == 403
    assert client.get(f"/api/v1/documents/{shared['id']}", headers=bob).status_code == 200


def test_unsupported_type_and_empty_file(client):
    assert _upload(client, filename="image.png", content=b"x").status_code == 415
    assert _upload(client, filename="empty.txt", content=b"").status_code == 400


def test_pdf_upload_preserves_page_count(client):
    from tests.helpers import make_pdf

    response = _upload(client, filename="two.pdf", content=make_pdf(["page one", "page two"]))
    assert response.status_code == 201
    assert response.json()["page_count"] == 2
