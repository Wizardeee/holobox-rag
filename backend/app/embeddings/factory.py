"""Cached embedding provider factory."""

from functools import lru_cache

from app.embeddings.sentence_transformers import SentenceTransformerEmbedder


@lru_cache(maxsize=4)
def get_embedder(model_name: str) -> SentenceTransformerEmbedder:
    return SentenceTransformerEmbedder(model_name)
