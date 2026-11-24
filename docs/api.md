# API

Base path `/api/v1`; JSON except `/transcribe` (multipart) and `/synthesize` (WAV response). Full machine-readable schema: `shared/api-contracts/openapi.json`. Protocol notes: `shared/communication-protocol/PROTOCOL.md`.

Auth is off by default for local use. Set `HOLOBOX_API_TOKEN` to require `Authorization: Bearer <token>` on all `/api/v1` routes except health. Every request uses `X-User-Id` (default `local-user`) for ownership; clients cannot set ownership through a request body.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Version + capability summary (also `/api/v1/health`) |
| POST | `/documents` | Upload `file` + `scope` (`user`/`shared`); returns `DocumentInfo` |
| GET | `/documents` | Visible documents (own + shared) |
| GET | `/documents/{id}` | Metadata |
| DELETE | `/documents/{id}` | Deletes file, DB row and all vectors (owner only) |
| POST | `/query` | `QueryRequest` → `QueryResponse` with sources + `generation_mode` |
| POST | `/transcribe` | multipart `audio` + optional `language` → text, language, duration |
| POST | `/synthesize` | `{text, voice?}` → `audio/wav` (cached by content hash) |
| GET | `/config/capabilities` | Providers, embedding model, STT models, Piper voices |
| GET/POST | `/conversations` | List / create conversations |
| GET/DELETE | `/conversations/{id}` | Open / delete conversation |

Example query:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/query \
  -H 'Content-Type: application/json' -H 'X-User-Id: local-user' \
  -d '{"question":"When does the library open?","owner_id":"local-user","include_sources":true}'
```

`generation_mode` is `mock`, `live` or `unavailable`. `mock` answers are explicitly labelled as test output and are forbidden in production. `live` means a real configured provider generated the answer — currently the local Ollama model `llama3.2:latest` through the generic OpenAI-compatible HTTP provider at `http://127.0.0.1:11434/v1`. If Ollama is stopped or out of memory, the response is `unavailable` with a `provider_error` warning and still includes retrieved `sources`; it never silently falls back to mock. When retrieval finds nothing, the response has `retrieved_context_available: false`, `warning: "no_relevant_context"` and a fixed honest answer.

Provider selection lives in `backend/.env` (`HOLOBOX_LLM_PROVIDER`, `HOLOBOX_LLM_BASE_URL`, `HOLOBOX_LLM_MODEL`, `HOLOBOX_LLM_TIMEOUT_SECONDS`). The college provider and mock remain available but are never used implicitly.

Errors: `{"detail":{"code":"...","message":"..."}}` with 400/403/404/413/415/422/500/503 as appropriate.

## Contract generation

Pydantic models in `backend/app/models/schemas.py` are the only source of truth. After changing them:

```bash
cd backend && .venv/bin/python -c \
  "import json; from app.main import app; json.dump(app.openapi(), open('../shared/api-contracts/openapi.json','w'), indent=2)"
cd ../frontend && npm run generate:api-types && npm run check:api-types
```

Never hand-edit `frontend/src/types/api.generated.ts`.
