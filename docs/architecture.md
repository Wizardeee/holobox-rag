# Architecture

## System shape

Two independent components talking over a versioned HTTP/WebSocket API.

```
Electron renderer (React/TS)  --preload bridge-->  Electron main
        |  HTTP /api/v1 (and WS for streaming)
        v
FastAPI backend  --> ingestion --> embeddings --> ChromaDB
        |              \--> retrieval --> RAG --> LLM provider
        |--> SQLite (documents, conversations, messages)
        |--> faster-whisper (STT)   |--> Piper (TTS) + audio cache
```

The backend has **no Electron dependency**. Any HTTP client — including a future Three.js avatar client — can call the same transcription, query and synthesis endpoints without backend changes. All endpoints are in `shared/communication-protocol/PROTOCOL.md`.

## Approved decisions (Stage 0)

1. **Mock LLM honesty.** The mock provider labels every answer as a development/test response, sets `generation_mode: "mock"`, and is refused at startup when `HOLOBOX_ENVIRONMENT=production`. It is never presented as a genuine AI answer.
2. **Ownership and access control.** Every document has `owner_id` and `scope` (`shared` or `user`). Retrieval filters to `(scope == shared) OR (scope == user AND owner_id == requester)`. The requester comes from the `X-User-Id` header (default `local-user`), so a future authenticated multi-user system only replaces that one dependency — no schema or RAG restructure.
3. **Contract source of truth.** FastAPI/Pydantic models in `backend/app/models/schemas.py` are authoritative. `openapi-typescript` generates `frontend/src/types/api.generated.ts` from the live backend's OpenAPI schema. `frontend/scripts/generate-api-types.mjs` performs generation and a staleness check that fails CI if generated types are outdated.
4. **Backend independence.** No avatar/Electron imports, no renderer secrets. STT, query and synthesis are separate, documented APIs consumable by a future avatar client.
5. **Local-first and M1/8GB-friendly.** All state in `backend/data/`. Small embeddings (`all-MiniLM-L6-v2`), cached `faster-whisper-base`, existing Piper voice, no local LLM by default. Embeddings are a singleton; STT/TTS load lazily and run off the event loop.
6. **No scope creep.** No Unity, no avatar rendering, no unnecessary dependencies.

## Boundaries

| Layer | Owns | Does not own |
|---|---|---|
| `api/` | HTTP validation, auth, error mapping | Business logic |
| `services/` | Use-case orchestration | HTTP details |
| `ingestion/`, `embeddings/`, `vector_db/`, `retrieval/`, `rag/`, `llm/`, `speech_to_text/`, `text_to_speech/` | One capability behind an interface | Each other's storage |
| `conversations/repository.py` | SQLite persistence | Vector storage |
| Electron `main` | Window, permissions, settings file, backend spawn config | RAG or AI logic |
| Electron `preload` | Narrow `contextBridge` API | Business logic |

## Contract generation

```bash
cd frontend
npm run generate:api-types   # regenerate from backend /openapi.json
npm run check:api-types      # fail if generated file is stale
```

`shared/api-contracts/openapi.json` holds the committed schema snapshot. All request/response shapes live only in `schemas.py`; generated TS types are never hand-edited.

## Storage layout (`backend/data/`, gitignored)

```
uploads/{document_id}/{safe_filename}   original uploaded file
chroma/                                ChromaDB persistent collection
holobox.db                             documents, conversations, messages (sqlite3)
audio_cache/{sha256}.wav                cached TTS audio (hash of text+voice)
tmp/                                    transient recordings, deleted after use
```

## Resource strategy

- Embedding model loaded once at first use; CPU inference, ~90 MB.
- Whisper model loaded on first transcription, `base` by default; configurable.
- Piper runs as a subprocess with the local voice model; loaded per synthesis request, cached output by content hash.
- Answer generation is provider-configured. This machine uses local Ollama `llama3.2:latest` (3.2B, ~2.6 GB loaded) through the generic HTTP provider; keep only one Ollama model loaded at a time. No provider configured means honest `unavailable`, never mock fallback.
