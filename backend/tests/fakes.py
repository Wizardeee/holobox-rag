"""Fast deterministic test doubles for embedding and vector storage."""

import hashlib

from app.vector_db.base import SearchHit


class FakeEmbedder:
    model_name = "fake-deterministic"
    dimension = 16

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * self.dimension
            for token in text.lower().split():
                digest = int(hashlib.sha256(token.encode()).hexdigest()[:8], 16)
                vector[digest % self.dimension] += 1.0
            norm = sum(value * value for value in vector) ** 0.5 or 1.0
            vectors.append([value / norm for value in vector])
        return vectors


class FakeVectorStore:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def add(self, document_id: str, chunks, embeddings: list[list[float]]) -> None:
        for chunk, embedding in zip(chunks, embeddings):
            self.rows.append({"chunk": chunk, "embedding": embedding})

    def search(
        self,
        embedding: list[float],
        top_k: int,
        allowed_document_ids: set[str] | None = None,
    ) -> list[SearchHit]:
        rows = self.rows
        if allowed_document_ids is not None:
            rows = [row for row in rows if row["chunk"].document_id in allowed_document_ids]
        scored = []
        for row in rows:
            score = sum(a * b for a, b in zip(embedding, row["embedding"]))
            if score > 0:
                scored.append((score, row))
        scored.sort(key=lambda item: -item[0])
        return [
            SearchHit(
                chunk_id=row["chunk"].id,
                document_id=row["chunk"].document_id,
                document_name=row["chunk"].document_name,
                page_number=row["chunk"].page_number,
                text=row["chunk"].text,
                score=score,
            )
            for score, row in scored[:top_k]
        ]

    def delete_document(self, document_id: str) -> None:
        self.rows = [row for row in self.rows if row["chunk"].document_id != document_id]

    def count(self) -> int:
        return len(self.rows)
