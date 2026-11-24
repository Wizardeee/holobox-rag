from app.models.schemas import Scope


def _upload(client, filename, content, user="alice", scope=Scope.USER):
    return client.post(
        "/api/v1/documents",
        files={"file": (filename, content, "text/plain")},
        data={"scope": scope.value},
        headers={"X-User-Id": user},
    )


def test_retrieval_returns_relevant_chunks_with_metadata(client):
    _upload(client, "cloud.txt", b"cloud computing exam notes about virtualization")
    hits = client.app.state.retriever.retrieve("cloud computing exam", "alice")
    assert hits
    assert hits[0].document_name == "cloud.txt"
    assert hits[0].text
    assert 0 < hits[0].score <= 1


def test_retrieval_respects_ownership(client):
    _upload(client, "private.txt", b"secret salary figures", user="alice")
    assert client.app.state.retriever.retrieve("salary figures", "alice")
    assert client.app.state.retriever.retrieve("salary figures", "bob") == []


def test_retrieval_includes_shared_documents(client):
    _upload(client, "policy.txt", b"shared visitor policy", user="alice", scope=Scope.SHARED)
    assert client.app.state.retriever.retrieve("visitor policy", "bob")


def test_retrieval_with_no_documents_returns_empty(client):
    assert client.app.state.retriever.retrieve("anything", "alice") == []
