# Implementation Status

| Stage | Status | Exit criteria | Result |
|---|---|---|---|
| 0 — Assessment & architecture | COMPLETE | Assessment, structure, roadmap, contract, risks | Approved 2026-11-24; spec committed; decisions in docs/architecture.md |
| 1 — FastAPI foundation | COMPLETE | health + config + errors + tests pass | 12 passed |
| 2 — Document ingestion | COMPLETE | extract/chunk/dedupe/delete tests pass | 28 passed |
| 3 — Embeddings + ChromaDB | COMPLETE | insert/search/filter/delete tests pass | 37 passed |
| 4 — Retrieval + RAG | COMPLETE | retrieval + citation + no-context tests pass | 50 passed |
| 5 — LLM providers | PENDING | provider switching + unavailable tests pass | — |
| 6 — Electron frontend | PENDING | app launches, reaches backend | — |
| 7 — Text chat | PENDING | typed question → answer + citations | — |
| 8 — Whisper STT | PENDING | audio → editable transcription | — |
| 9 — Piper TTS | PENDING | answer → cached audio, playback | — |
| 10 — Voice workflow | PENDING | full pipeline + text fallback | — |
| 11 — Testing/packaging | PENDING | suite green, docs complete, Windows prep | — |

## Stage 0 notes

- Greenfield: no prior Holobox code; nothing migrated or deleted. MASTER_SPEC.md committed from the approved inline spec.
- Environment: Python 3.12.4, Node 24.12.0; FastAPI, ChromaDB, sentence-transformers, faster-whisper, pypdf, docx2txt, pytest already installed locally.
- Six added requirements incorporated into docs/architecture.md.
- Autonomous execution through Stage 11 authorized; stage transitions do not require approval.

## Stage 1 report (2026-11-24)

- Implemented: `create_app()` factory, config with `HOLOBOX_*` env overrides and production guard against mock LLM, uniform error envelope, optional bearer token, requester identity, CORS, startup directory creation, full Pydantic API contract in `app/models/schemas.py`, health endpoints.
- Files: `backend/app/main.py`, `backend/app/core/{config,errors,logging,security}.py`, `backend/app/models/schemas.py`, `backend/app/api/{health,router}.py`, `backend/tests/*`, `backend/requirements.txt`, `backend/.env.example`.
- Dependencies: pinned already-installed stack (no new downloads); venv at `backend/.venv` created with `--system-site-packages`.
- Tests: `.venv/bin/python -m pytest tests -q` → **12 passed** (health, CORS, config guards, error envelope, token dependency).
- Known limitations: `/api/v1/query`, documents, voice and conversation routes do not exist yet; contract-level tests for them arrive with their stages. One harmless `python-multipart` PendingDeprecationWarning from installed Starlette.
- Next: Stage 2 — document ingestion.

## Stage 2 report (2026-11-24)

- Implemented: PDF/DOCX/TXT/Markdown extraction with page numbers, word-boundary chunking with overlap, SQLite repository (documents/chunks/conversations/messages), SHA-256 dedupe, ownership-scoped document APIs, deletion with file cleanup, optional bearer token on document routes.
- Files: `backend/app/ingestion/{extractors,chunking,ingestor}.py`, `backend/app/services/{repository,dependencies}.py`, `backend/app/api/documents.py`, `backend/tests/{helpers,test_extractors,test_chunking,test_documents_api,test_repository}.py`.
- Dependencies: none added (pypdf, docx2txt already pinned in Stage 1).
- Tests: `.venv/bin/python -m pytest tests -q` → **28 passed**. Fixed during the stage: missing `/api/v1` route prefix, malformed test PDF header, `created_at` omission in `DocumentInfo`, word-splitting overlap.
- Known limitations: embeddings/vector index not wired yet (Stage 3); no re-index endpoint; extraction of scanned PDFs (images) yields empty text.
- Next: Stage 3 — embeddings and ChromaDB.

## Stage 3 report (2026-11-24)

- Implemented: `EmbeddingProvider` and `VectorStore` interfaces, lazy Sentence Transformers embedder (`all-MiniLM-L6-v2`, 384-dim, normalized), ChromaDB persistent store with cosine space and ownership metadata, idempotent `Indexer`, automatic indexing on upload, vector cleanup on document delete.
- Files: `backend/app/embeddings/{base,sentence_transformers,factory}.py`, `backend/app/vector_db/{base,chroma,factory}.py`, `backend/app/services/indexer.py`, wiring in `main.py`/`ingestor.py`/`documents.py`, `backend/tests/{fakes,test_embeddings,test_vector_db,test_indexer,test_indexing_api}.py`.
- Dependencies: none added; verified ChromaDB 1.0.20 API against the installed package before use. Real embedding model downloaded and verified locally (384-dim).
- Tests: `.venv/bin/python -m pytest tests -q` → **37 passed**. Fast deterministic fakes keep the suite at ~9 s; one test exercises the real model.
- Known limitations: no re-index API yet; no metadata-only re-ranking; no change to retrieval scoring beyond cosine similarity.
- Next: Stage 4 — retrieval and RAG pipeline with citations and no-context handling.

## Stage 4 report (2026-11-24)

- Implemented: scope-filtered retrieval with query embeddings, grounded prompt template, RAG pipeline with source references and strict no-context answer, graceful generation failure handling, conversation persistence, POST `/api/v1/query` with ownership enforcement.
- Files: `backend/app/retrieval/retriever.py`, `backend/app/rag/{prompts,pipeline}.py`, `backend/app/llm/{base,unavailable,factory}.py`, `backend/app/api/query.py`, service wiring, `backend/tests/{test_retriever,test_rag_pipeline,test_query_api}.py`.
- Dependencies: none added.
- Tests: `.venv/bin/python -m pytest tests -q` → **50 passed**. Fixed one incorrect test that matched header and body owners by mistake.
- Known limitations: default provider is explicitly unavailable — answers need Stage 5 providers; no streaming endpoint yet; prompt is a single fixed template.
- Next: Stage 5 — concrete LLM providers and capability endpoint.

## Latest stage report

_Stage 4 complete; 50 tests passing._
