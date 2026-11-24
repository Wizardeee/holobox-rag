# Holobox RAG

Standalone, local-first, voice-enabled document RAG assistant for the Holobox project.

- **Frontend:** Electron + React + TypeScript + Vite (secure preload, no Node integration)
- **Backend:** Python + FastAPI — independent of Electron and any avatar client
- **Retrieval:** Sentence Transformers (`all-MiniLM-L6-v2`) + ChromaDB
- **Voice:** faster-whisper (STT) + Piper (TTS), both local
- **LLM:** replaceable provider interface — labelled mock, generic HTTP, future college adapter

Full specification: [MASTER_SPEC.md](MASTER_SPEC.md) · Architecture: [docs/architecture.md](docs/architecture.md) · Setup: [docs/setup.md](docs/setup.md) · API: [docs/api.md](docs/api.md) · Deployment: [docs/deployment.md](docs/deployment.md) · Status: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)

## Quick start (macOS)

```bash
# Backend
cd backend
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run build && npm run electron:build
npm run electron
```

For live UI development use `npm run dev` and `VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron`.

Verify the backend: `curl http://127.0.0.1:8000/api/v1/health`.

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests -q
cd frontend && npm run build && npm run electron:build && npm run check:api-types
```

Mock answers are clearly labelled as development/test output and are forbidden when `HOLOBOX_ENVIRONMENT=production`. The backend stays usable for document management and retrieval with no LLM configured; see `docs/setup.md` for connecting a real or future college LLM.

All documents, vectors, conversations and audio stay under `backend/data/` (gitignored). Nothing is sent to an external service unless a non-mock LLM provider is explicitly configured.
