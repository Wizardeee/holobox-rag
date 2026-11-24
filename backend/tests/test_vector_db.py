from app.vector_db.base import VectorChunk
from app.vector_db.chroma import ChromaVectorStore
from tests.fakes import FakeEmbedder


def _chunk(chunk_id="c1", document_id="d1", text="cloud exam notes", page=2):
    return VectorChunk(
        id=chunk_id,
        document_id=document_id,
        document_name="notes.pdf",
        page_number=page,
        owner_id="alice",
        scope="user",
        text=text,
        chunk_index=0,
    )


def test_chroma_add_search_filter_delete(tmp_path):
    store = ChromaVectorStore(str(tmp_path / "chroma"), "test")
    embedder = FakeEmbedder()
    store.add("d1", [_chunk()], embedder.embed(["cloud exam notes"]))
    store.add(
        "d2",
        [_chunk("c2", "d2", "unrelated tropical fruit", None)],
        embedder.embed(["unrelated tropical fruit"]),
    )
    assert store.count() == 2

    query = embedder.embed(["cloud exam notes"])[0]
    hits = store.search(query, top_k=5)
    assert hits[0].document_id == "d1"
    assert hits[0].page_number == 2
    assert hits[0].score > hits[1].score

    filtered = store.search(query, top_k=5, allowed_document_ids={"d2"})
    assert all(hit.document_id == "d2" for hit in filtered)
    assert store.search(query, top_k=5, allowed_document_ids=set()) == []

    store.delete_document("d1")
    assert store.count() == 1
    assert all(hit.document_id == "d2" for hit in store.search(query, top_k=5))


def test_chroma_persists_across_clients(tmp_path):
    path = str(tmp_path / "chroma")
    embedder = FakeEmbedder()
    ChromaVectorStore(path, "test").add("d1", [_chunk()], embedder.embed(["cloud exam notes"]))
    reopened = ChromaVectorStore(path, "test")
    assert reopened.count() == 1
    assert reopened.search(embedder.embed(["cloud exam notes"])[0], top_k=1)[0].document_id == "d1"
