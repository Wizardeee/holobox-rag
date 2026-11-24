"""FastAPI application factory. No Electron or avatar imports, ever."""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.documents import router as documents_router
from app.api.health import router as health_router
from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import setup_logging
from app.api.config import router as config_router
from app.api.query import router as query_router
from app.embeddings.base import EmbeddingProvider
from app.embeddings.factory import get_embedder
from app.ingestion.ingestor import Ingestor
from app.llm.base import LLMProvider
from app.llm.factory import get_llm_provider
from app.rag.pipeline import RAGPipeline
from app.retrieval.retriever import Retriever
from app.services.indexer import Indexer
from app.services.repository import Repository
from app.vector_db.base import VectorStore
from app.vector_db.factory import get_chroma_store

logger = logging.getLogger(__name__)


def create_embedder(settings) -> EmbeddingProvider:
    return get_embedder(settings.embedding_model)


def create_vector_store(settings) -> VectorStore:
    return get_chroma_store(str(settings.chroma_dir), settings.chroma_collection)


def create_llm_provider(settings) -> LLMProvider:
    return get_llm_provider(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_directories()
    setup_logging(settings.environment)
    repository = Repository(settings.database_path)
    repository.init()
    embedder = create_embedder(settings)
    vector_store = create_vector_store(settings)
    app.state.repository = repository
    app.state.embedder = embedder
    app.state.vector_store = vector_store
    app.state.ingestor = Ingestor(settings, repository, Indexer(repository, embedder, vector_store))
    provider = create_llm_provider(settings)
    retriever = Retriever(repository, embedder, vector_store, settings)
    app.state.retriever = retriever
    app.state.llm_provider = provider
    app.state.pipeline = RAGPipeline(retriever, provider, repository, settings)
    logger.info("Holobox RAG backend %s ready (data dir: %s)", __version__, settings.data_dir)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Holobox RAG API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(documents_router)
    app.include_router(query_router)
    app.include_router(config_router)
    app.include_router(api_router)

    @app.get("/health", include_in_schema=False)
    def root_health():
        return {"status": "ok", "version": __version__}

    return app


app = create_app()
