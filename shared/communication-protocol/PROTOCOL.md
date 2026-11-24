# Communication Protocol (v1)

Base path: `/api/v1`. JSON unless noted. A future avatar client uses exactly these endpoints.

## Authentication & identity

- Local-first: no auth by default. When `HOLOBOX_API_TOKEN` is set on the backend, every request must send `Authorization: Bearer <token>`.
- `X-User-Id` identifies the requester (default `local-user`). It is an identity hint, not a secret. The frontend stores it locally and sends it on every request. Ownership is always taken from this header — never from a request body — so a client cannot claim another user's documents.
- Ownership: user documents are visible only to their owner; `scope=shared` documents are visible to all.

## Endpoints

| Method | Path | Body / input | Response |
|---|---|---|---|
| GET | `/api/v1/health` | — | `{status, version, capabilities}` |
| POST | `/api/v1/documents` | multipart `file`, form `scope` | `DocumentInfo` (status `processing`→`ready`) |
| GET | `/api/v1/documents` | query `owner_id` | `DocumentInfo[]` (scope-filtered) |
| GET | `/api/v1/documents/{id}` | — | `DocumentInfo` |
| DELETE | `/api/v1/documents/{id}` | query `owner_id` | `{deleted: true}` + vector cleanup |
| POST | `/api/v1/query` | `QueryRequest` | `QueryResponse` (answer, sources, generation_mode) |
| POST | `/api/v1/transcribe` | multipart `audio`, form `language?`, `owner_id` | `TranscriptionResponse` |
| POST | `/api/v1/synthesize` | `SynthesisRequest` | `audio/wav` (or cached) |
| GET | `/api/v1/conversations` | query `owner_id` | `ConversationSummary[]` |
| GET | `/api/v1/conversations/{id}` | — | `Conversation` with messages |
| POST | `/api/v1/conversations` | `ConversationCreate` | `Conversation` |
| DELETE | `/api/v1/conversations/{id}` | — | `{deleted: true}` |
| GET | `/api/v1/config/capabilities` | — | `{providers, embedding_model, stt_models, tts_voices, llm_configured}` |

## Contract rules

- All shapes are defined once in `backend/app/models/schemas.py` (Pydantic). TS types are generated from OpenAPI; never hand-edited.
- Errors use `{"detail": {"code": "...", "message": "..."}}`. HTTP status codes: 400 validation, 403 forbidden, 404 not found, 413 file too large, 415 unsupported type, 503 capability unavailable.
- `generation_mode` is one of `mock | live | unavailable`. `unavailable` still returns retrieved `sources`; the answer explains that generation is unavailable.
- Streaming (optional): `WS /api/v1/ws/query` sends token deltas then a final result frame. Clients must work without it.

## Frontend settings

The renderer stores only: backend URL, user id, voice/model preferences, feature toggles. No API keys or backend secrets are stored in the renderer. Provider credentials are configureable only through backend environment variables.
