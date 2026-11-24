# Communication Protocol (v1)

Base path: `/api/v1`. JSON unless noted. A future Three.js avatar client uses exactly these endpoints.

## Authentication & identity

- Local-first: no auth by default. When `HOLOBOX_API_TOKEN` is set on the backend, every `/api/v1` request except health requires `Authorization: Bearer <token>`.
- `X-User-Id` identifies the requester (default `local-user`). It is an identity hint stored locally by the client, not a credential. Ownership is always taken from this header — never from a request body.
- Ownership: user documents/conversations are visible only to their owner; `scope=shared` documents are visible to all. Deletion requires ownership.

## Endpoints

| Method | Path | Body / input | Response |
|---|---|---|---|
| GET | `/api/v1/health` | — | `HealthResponse` (unauthenticated) |
| POST | `/api/v1/documents` | multipart `file`, form `scope` | `DocumentInfo` (`processing`→`ready`/`failed`) |
| GET | `/api/v1/documents` | — | `DocumentInfo[]` (own + shared) |
| GET | `/api/v1/documents/{id}` | — | `DocumentInfo` |
| DELETE | `/api/v1/documents/{id}` | — | `DeletedResponse` + vector/file cleanup |
| POST | `/api/v1/query` | `QueryRequest` | `QueryResponse` (answer, sources, `generation_mode`) |
| POST | `/api/v1/transcribe` | multipart `audio`, form `language?` | `TranscriptionResponse` |
| POST | `/api/v1/synthesize` | `SynthesisRequest` | `audio/wav` (content-hash cached) |
| GET | `/api/v1/config/capabilities` | — | `CapabilitiesResponse` |
| GET/POST | `/api/v1/conversations` | `ConversationCreate` for POST | `ConversationSummary[]` / `Conversation` |
| GET/DELETE | `/api/v1/conversations/{id}` | — | `Conversation` / `DeletedResponse` |

## Contract rules

- All shapes are defined once in `backend/app/models/schemas.py` (Pydantic). TS types are generated from OpenAPI into `frontend/src/types/api.generated.ts`; never edit them by hand. `shared/api-contracts/openapi.json` is the committed snapshot.
- Errors use `{"detail": {"code": "...", "message": "..."}}`. Codes include `validation_error`, `unauthorized`, `forbidden`, `not_found`, `unsupported_type`, `file_too_large`, `invalid_file`, `unsupported_audio_type`, `empty_audio`, `audio_too_large`, `transcription_failed`, `tts_unavailable`, `no_relevant_context`, `mock_provider`, `provider_unavailable`.
- `generation_mode` is `mock | live | unavailable`. Mock answers are explicitly labelled and forbidden in production. With no provider, `unavailable` still returns retrieved `sources`.
- When retrieval finds nothing: `retrieved_context_available: false`, `warning: "no_relevant_context"`, fixed honest answer.
- Streaming: the generic HTTP provider implements SSE token streaming internally. A WebSocket query endpoint (`WS /api/v1/ws/query`) is the planned non-breaking addition for avatar clients; clients must work without it.

## Desktop client settings

The renderer stores only backend URL, optional API token, user id, voice/model preferences and feature toggles — in Electron `userData`, never in renderer source. All HTTP calls are made by the Electron main process over a narrow preload bridge, so the renderer never touches backend internals or secrets.
