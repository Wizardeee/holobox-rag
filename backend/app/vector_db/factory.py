"""Cached vector store factory."""

from functools import lru_cache

from app.vector_db.chroma import ChromaVectorStore


@lru_cache(maxsize=8)
def get_chroma_store(path: str, collection_name: str) -> ChromaVectorStore:
    return ChromaVectorStore(path, collection_name)
