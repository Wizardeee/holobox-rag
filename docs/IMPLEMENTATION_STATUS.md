# Implementation Status

| Stage | Status | Exit criteria | Result |
|---|---|---|---|
| 0 — Assessment & architecture | COMPLETE | Assessment, structure, roadmap, contract, risks | Approved 2026-11-24; spec committed; decisions in docs/architecture.md |
| 1 — FastAPI foundation | COMPLETE | health + config + errors + tests pass | 12 passed |
| 2 — Document ingestion | COMPLETE | extract/chunk/dedupe/delete tests pass | 28 passed |
| 3 — Embeddings + ChromaDB | PENDING | insert/search/filter/delete tests pass | — |
| 4 — Retrieval + RAG | PENDING | retrieval + citation + no-context tests pass | — |
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

## Latest stage report

_Stage 2 complete; 28 tests passing._
