# Holobox — College Demonstration System

Two user-facing interfaces, one shared local-first backend:

- **Teacher Admin Portal** — browser app (`teacher.html`) for course/subject selection, document upload, approval, re-indexing, replacement and deletion.
- **Student Holobox Kiosk** — fullscreen Electron app with a Three.js avatar, microphone, voice pipeline and course-scoped answers. It has no document-management or configuration UI.
- **Shared FastAPI backend** — authentication, courses, SQLite registry, ChromaDB, RAG with Ollama, faster-whisper STT and Piper TTS.

Full specification: [MASTER_SPEC.md](MASTER_SPEC.md) · Architecture: [docs/architecture.md](docs/architecture.md) · Avatar inspection: [docs/AVATAR_INSPECTION.md](docs/AVATAR_INSPECTION.md) · Deployment: [docs/deployment.md](docs/deployment.md) · API: [docs/api.md](docs/api.md) · Final report: [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) · Status: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)

## Run locally (MacBook)

Prerequisites: Ollama running with `llama3.2:latest`; `backend/.env` copied from `.env.example` with generated credentials and local Piper paths.

```bash
# 1. Backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Teacher portal (browser, http://localhost:5174/teacher.html)
cd ../frontend
npm install
npm run dev:teacher

# 3. Student kiosk (second terminal)
cd ../frontend
HOLOBOX_KIOSK_TOKEN=<token from backend/.env> npm run electron:build && \
HOLOBOX_KIOSK_TOKEN=<token from backend/.env> npm run electron
```

Teacher demo login (from this machine's gitignored `.env`): `teacher` / `college2026`. Change it for any real deployment.

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests -q
cd ../frontend && npm run build && npm run electron:build && npm run check:api-types
```

The avatar asset is `CC-BY-4.0`, author Poliko (Sketchfab). Attribution must be kept in any public demonstration. All user data stays in `backend/data/` (gitignored).
