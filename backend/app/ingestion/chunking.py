"""Word-boundary chunking that preserves page boundaries and overlap."""

from __future__ import annotations

from dataclasses import dataclass

from app.ingestion.extractors import ExtractedDocument


@dataclass(frozen=True)
class Chunk:
    text: str
    page_number: int | None


def _split_text(text: str, size: int, overlap: int) -> list[str]:
    """Sliding window over whole words, so overlap never cuts a word in half."""
    words: list[str] = []
    for word in text.split():
        while len(word) > size:
            words.append(word[:size])
            word = word[size:]
        if word:
            words.append(word)
    if not words:
        return []

    chunks: list[str] = []
    current: list[str] = []
    for word in words:
        candidate = " ".join([*current, word])
        if len(candidate) <= size:
            current.append(word)
            continue
        if current:
            chunks.append(" ".join(current))
        tail: list[str] = []
        tail_length = 0
        for previous in reversed(current):
            if tail_length + len(previous) + 1 > overlap:
                break
            tail.insert(0, previous)
            tail_length += len(previous) + 1
        current = [*tail, word]
    if current:
        chunks.append(" ".join(current))
    return chunks


def chunk_document(document: ExtractedDocument, size: int, overlap: int) -> list[Chunk]:
    """Chunk page by page so every chunk keeps an accurate page number."""
    chunks: list[Chunk] = []
    for page_number, text in document.pages:
        for piece in _split_text(text, size, overlap):
            chunks.append(Chunk(text=piece, page_number=page_number))
    return chunks
