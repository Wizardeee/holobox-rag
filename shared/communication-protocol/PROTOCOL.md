# Communication Protocol (v1)

Both clients call the same FastAPI backend at `/api/v1`. See `docs/api.md` and
`shared/api-contracts/openapi.json` for exact shapes.

## Identity and authorization

- Teacher: `POST /auth/login` → signed bearer token (role `teacher`).
- Kiosk: provisioned static bearer token from `HOLOBOX_KIOSK_TOKEN` (role `kiosk`).
- Identity/role/course permissions are derived **only** from the bearer token.
  `X-User-Id` is never trusted as authentication (dev-test mode excepted, and
  production refuses to start with auth disabled).
- Document management endpoints exist only for `teacher`; the kiosk receives 403.
- Kiosk queries require `course_id`; retrieval is limited to that course and
  `approved=1` documents by the backend before any vector search.

## Flow

1. Teacher logs in, selects course/subject, uploads PDF/DOCX/TXT/MD.
2. Backend extracts text, chunks, embeds with MiniLM, writes SQLite + ChromaDB
   metadata (`course_id`, `subject_id`, `approved`, `document_id`).
3. Kiosk streams microphone audio to `/transcribe`; Whisper returns text.
4. Kiosk posts `{question, course_id}` to `/query`; backend filters documents,
   retrieves chunks, builds a grounded prompt, calls Ollama, returns answer +
   citations. No context → fixed honest answer with `no_relevant_context`.
5. Kiosk posts answer text to `/synthesize`; Piper returns WAV. The kiosk plays
   that single audio element and drives avatar motion from a Web Audio analyser.

## Streaming

The HTTP LLM provider implements SSE internally. A `WS /api/v1/ws/query` token
stream is a non-breaking future addition for avatar clients; the current kiosk
works without it.

## Contract generation

Pydantic models in `backend/app/models/schemas.py` are the only source of truth.
Never edit `frontend/src/types/api.generated.ts` by hand; run
`npm run generate:api-types` after schema changes.
