from app.models.schemas import Scope


def _upload(client, filename, content, course_id="gpu-architecture", approved=True):
    return client.post(
        "/api/v1/documents",
        files={"file": (filename, content, "text/plain")},
        data={"scope": Scope.USER.value, "course_id": course_id, "approved": str(approved).lower()},
        headers={"X-User-Id": "alice"},
    )


def test_retrieval_returns_relevant_chunks_with_metadata(client):
    _upload(client, "cloud.txt", b"cloud computing exam notes about virtualization")
    hits = client.app.state.retriever.retrieve("cloud computing exam", "alice", course_id="gpu-architecture")
    assert hits
    assert hits[0].document_name == "cloud.txt"
    assert 0 < hits[0].score <= 1


def test_retrieval_is_scoped_to_course(client):
    _upload(client, "gpu.txt", b"cuda gpu architecture exam notes", course_id="gpu-architecture")
    _upload(client, "history.txt", b"world history exam notes", course_id="general")

    gpu_hits = client.app.state.retriever.retrieve("exam notes", "alice", course_id="gpu-architecture")
    assert {hit.document_name for hit in gpu_hits} == {"gpu.txt"}

    history_hits = client.app.state.retriever.retrieve("exam notes", "alice", course_id="general")
    assert {hit.document_name for hit in history_hits} == {"history.txt"}


def test_retrieval_excludes_unapproved_documents(client):
    _upload(client, "draft.txt", b"unapproved draft lecture notes", approved=False)
    assert client.app.state.retriever.retrieve(
        "draft lecture notes", "alice", course_id="gpu-architecture", approved_only=True
    ) == []
    assert client.app.state.retriever.retrieve(
        "draft lecture notes", "alice", course_id="gpu-architecture", approved_only=False
    )


def test_retrieval_with_no_documents_returns_empty(client):
    assert client.app.state.retriever.retrieve("anything", "alice", course_id="general") == []
