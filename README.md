# Holobox RAG

Standalone, local-first, voice-enabled document RAG assistant.

- **Frontend:** Electron + React + TypeScript + Vite
- **Backend:** Python + FastAPI (independent of Electron)
- **Retrieval:** Sentence Transformers embeddings + ChromaDB
- **Voice:** faster-whisper (STT), Piper (TTS)
- **LLM:** replaceable provider interface (mock / generic HTTP / future college-hosted)

Full specification: [MASTER_SPEC.md](MASTER_SPEC.md). Architecture: [docs/architecture.md](docs/architecture.md). Setup: [docs/setup.md](docs/setup.md). Status: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Quick start

```bash
# Backend
cd backend
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

All user data (documents, vector DB, conversations, audio cache) stays under `backend/data/` and is gitignored. The app is local-first; nothing leaves the machine unless a non-mock LLM provider is explicitly configured.

> Mock LLM responses are clearly labelled as development/test output and are disabled when `HOLOBOX_ENVIRONMENT=production`.
