# Architecture

## System shape

```
 Browser (Teacher Portal, teacher.html) ─┐
                                          ├─ /api/v1 (HTTP + bearer tokens) ─► FastAPI backend
 Electron (Student Kiosk, index.html) ────┘                                     │
   ├─ preload bridge (no Node in renderer)                                    ├─ auth: teacher / kiosk roles
   ├─ Three.js avatar (state + amplitude)                                     ├─ courses → subjects → documents (SQLite)
   └─ single audio owner (Web Audio analyser)                                 ├─ ingestion → embedding → ChromaDB
                                                                               ├─ course-filtered RAG → Ollama
                                                                               └─ whisper STT / piper TTS + audio cache
```

The backend has no Electron or avatar dependency. Both clients use the same API
and the same knowledge base. The kiosk cannot reach document-management endpoints
at all — the backend rejects those operations for the kiosk role.

## Decisions that must stay true

1. **Mock honesty** — labelled dev-only; refused in production. Never a silent fallback.
2. **Identity from token only** — `X-User-Id` is not authentication (dev mode with
   `HOLOBOX_AUTH_ENABLED=false` exists only for tests). Production requires auth,
   a hashed teacher password and rotated secrets.
3. **Course scoping in the backend** — kiosk queries are filtered by selected
   course/subject and `approved=1` before any vector search; client-side selection
   is only a request parameter, never an access-control decision.
4. **Contract source of truth** — Pydantic in `backend/app/models/schemas.py`;
   OpenAPI snapshot in `shared/api-contracts/openapi.json`; generated TS types in
   `frontend/src/types/api.generated.ts` (`npm run check:api-types` fails if stale).
5. **Local-first resource strategy** — MiniLM embeddings, `llama3.2:latest` (3.2B,
   ~2.6 GB loaded), Whisper `base`, Piper subprocess. No cloud inference.
6. **Avatar separation** — `AvatarController` knows nothing about RAG or audio
   requests; the kiosk hook owns the single audio element and passes an analyser.
   The model has no morphs or jaw bone, so speaking is amplitude-driven head motion,
   not phoneme lip sync (see `docs/AVATAR_INSPECTION.md`).

## Layout

```
backend/app/
  api/            auth, courses, documents, query, voice, synthesis, conversations, config, health
  core/           config, auth (PBKDF2 + signed tokens), errors, security, logging
  ingestion/      extractors, chunking, ingestor (ingest/reindex)
  embeddings/     Sentence Transformers provider behind interface
  vector_db/      ChromaDB provider behind interface (course/subject/approved metadata)
  retrieval/      scope-filtered retriever
  rag/            grounded prompt + pipeline
  llm/            provider interface: mock / HTTP (Ollama) / college stub
  speech_to_text/ faster-whisper
  text_to_speech/ Piper + content-hash cache
  services/       repository (SQLite), indexer, dependencies
frontend/
  src/kiosk/      student-only fullscreen experience
  src/avatar/     AvatarController (Three.js state/motion)
  src/components/Avatar.tsx  renderer only
  src/hooks/      useKioskConversation (voice pipeline + audio ownership), useSettings
  src/services/   api.ts (typed), transport.ts (bridge or browser fetch)
  src/teacher/    browser admin portal page
  electron/       main/preload with narrow bridge and kiosk credential
  public/avatar/  bundled GLB (source asset untouched)
```

## Storage

`backend/data/` (gitignored): `uploads/`, `chroma/`, `holobox.db`, `audio_cache/`, `tmp/`.

Schema: `documents` (now with `course_id`, `subject_id`, `approved`, `uploader`, `updated_at`), `document_chunks`, `conversations`, `messages`, `courses`, `subjects`. Existing databases are migrated forward on startup with `ALTER TABLE` and backfilled to `general`/approved.
