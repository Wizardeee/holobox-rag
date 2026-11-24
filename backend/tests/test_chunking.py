from app.ingestion.chunking import chunk_document
from app.ingestion.extractors import ExtractedDocument


def test_chunks_respect_size_and_page_numbers():
    pages = [(1, "word " * 100), (3, "third page content")]
    chunks = chunk_document(ExtractedDocument(pages), size=80, overlap=10)
    assert chunks
    assert all(len(chunk.text) <= 80 * 2 for chunk in chunks)  # long words may split at size
    assert {chunk.page_number for chunk in chunks} == {1, 3}
    assert any(chunk.page_number == 3 and "third" in chunk.text for chunk in chunks)


def test_chunking_empty_document_returns_nothing():
    assert chunk_document(ExtractedDocument([]), 100, 10) == []


def test_overlap_preserves_context_between_chunks():
    text = " ".join(f"token{i}" for i in range(200))
    chunks = chunk_document(ExtractedDocument([(None, text)]), size=120, overlap=40)
    assert len(chunks) > 1
    assert chunks[1].text.split()[0] in chunks[0].text.split()[-6:]
