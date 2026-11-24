from datetime import datetime, timezone

from app.models.schemas import DocumentInfo, DocumentStatus, Scope
from app.services.repository import Repository


def _document(document_id="doc1", owner="alice", scope=Scope.USER, digest="abc"):
    return DocumentInfo(
        id=document_id,
        name="notes.txt",
        scope=scope,
        owner_id=owner,
        status=DocumentStatus.READY,
        size_bytes=10,
        sha256=digest,
        created_at=datetime.now(timezone.utc),
    )


def test_repository_document_and_chunk_lifecycle(tmp_path):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    repository.create_document(_document())
    repository.add_chunks("doc1", [("c1", 1, "first"), ("c2", None, "second")])

    assert repository.get_document("doc1").chunk_count == 0
    repository.update_document("doc1", chunk_count=2)
    assert repository.get_document("doc1").chunk_count == 2
    assert [chunk["text"] for chunk in repository.get_chunks("doc1")] == ["first", "second"]

    assert repository.delete_document("doc1") is True
    assert repository.get_document("doc1") is None
    assert repository.get_chunks("doc1") == []


def test_repository_hash_lookup_and_owner_filtering(tmp_path):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    repository.create_document(_document("a", "alice", Scope.USER, "same"))
    repository.create_document(_document("b", "bob", Scope.SHARED, "same"))

    assert repository.find_by_hash("same", "alice", Scope.USER).id == "a"
    assert {item.id for item in repository.list_documents("bob")} == {"b"}


def test_repository_conversation_messages(tmp_path):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    repository.create_conversation("conv1", "alice", "First chat")
    repository.add_message("conv1", "m1", "user", "Hello", [])
    conversation = repository.get_conversation("conv1")
    assert conversation["title"] == "First chat"
    assert conversation["messages"][0].content == "Hello"
    assert repository.list_conversations("alice")[0]["message_count"] == 1
    assert repository.delete_conversation("conv1") is True
    assert repository.get_conversation("conv1") is None
