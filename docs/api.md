# API v1

Base path `/api/v1`; JSON except `/transcribe` (multipart) and `/synthesize` (WAV). Schema: `shared/api-contracts/openapi.json`. Protocol notes: `shared/communication-protocol/PROTOCOL.md`.

## Authentication

- `POST /auth/login` with `{username, password}` → signed bearer token (teacher role).
- `GET /auth/me` → current identity and permitted courses.
- Kiosk uses a provisioned static token from `HOLOBOX_KIOSK_TOKEN` as `Authorization: Bearer …`.
- Role and identity are derived from the token. `X-User-Id` is ignored when auth is enabled; it is accepted only in explicit test/dev mode (`HOLOBOX_AUTH_ENABLED=false`), which production config rejects.
- `HOLOBOX_API_TOKEN` is an optional legacy shared-secret header for the whole API.

## Endpoints

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/health` | public | Version/capabilities |
| POST | `/auth/login` | public | Teacher login |
| GET | `/auth/me` | teacher/kiosk | Identity |
| GET | `/courses` | teacher/kiosk | Courses (kiosk sees only permitted) |
| POST | `/courses` | teacher | Create course |
| GET | `/courses/{id}/subjects` | teacher/kiosk | Subjects |
| POST | `/courses/{id}/subjects` | teacher | Create subject |
| POST | `/documents` | teacher | Upload with `course_id`, `subject_id?`, `approved` |
| GET | `/documents?course_id=&subject_id=` | teacher/kiosk | Documents (kiosk: approved only) |
| GET | `/documents/{id}` | teacher/kiosk | Metadata (kiosk: approved/permitted only) |
| PATCH | `/documents/{id}` | teacher | Approve/hide, move subject |
| POST | `/documents/{id}/reindex` | teacher | Rebuild embeddings/vectors |
| POST | `/documents/{id}/replace` | teacher | Replace file, preserve association |
| DELETE | `/documents/{id}` | teacher | Delete file, row and vectors |
| POST | `/query` | teacher/kiosk | Course-filtered RAG answer + citations |
| POST | `/transcribe` | teacher/kiosk | multipart audio → text |
| POST | `/synthesize` | teacher/kiosk | `{text, voice?}` → WAV |
| GET | `/config/capabilities` | teacher/kiosk | Providers, models, voices |
| GET/POST | `/conversations` | teacher/kiosk | Local history |
| GET/DELETE | `/conversations/{id}` | teacher/kiosk | Open/delete |

Kiosk queries **must** include `course_id`; a different or unpermitted course returns 403. Retrieval is filtered in the backend to approved documents of that course/subject before vector search. `generation_mode` is `live`, `mock` (labelled dev only) or `unavailable` (never silent mock fallback). No-context answers return `retrieved_context_available: false` and `warning: no_relevant_context`.

Errors: `{"detail":{"code":"...","message":"..."}}`. TTS codes: `tts_binary_missing`, `tts_voice_missing`, `tts_timeout`, `tts_generation_failed`, etc. Full stderr stays in backend logs.

After changing Pydantic models, regenerate the contract:

```bash
cd backend && .venv/bin/python -c \
  "import json; from app.main import app; json.dump(app.openapi(), open('../shared/api-contracts/openapi.json','w'), indent=2)"
cd ../frontend && npm run generate:api-types && npm run check:api-types
```
