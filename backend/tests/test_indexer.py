from app.services.indexer import Indexer
from app.services.repository import Repository
from tests.fakes import FakeEmbedder, FakeVectorStore
from tests.test_repository import _document


def test_indexer_indexes_chunks_and_is_idempotent(tmp_path):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    repository.create_document(_document())
    repository.add_chunks("doc1", [("c1", 1, "cloud notes"), ("c2", 2, "backup notes")])
    store = FakeVectorStore()
    indexer = Indexer(repository, FakeEmbedder(), store)

    assert indexer.index_document("doc1") == 2
    assert store.count() == 2
    assert indexer.index_document("doc1") == 2
    assert store.count() == 2  # re-index does not duplicate vectors
    assert store.rows[0]["chunk"].document_name == "notes.txt"


def test_indexer_handles_missing_document(tmp_path):
    repository = Repository(tmp_path / "db.sqlite")
    repository.init()
    assert Indexer(repository, FakeEmbedder(), FakeVectorStore()).index_document("missing") == 0
