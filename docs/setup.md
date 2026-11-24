# Setup (macOS development)

Tested on macOS with Python 3.12 and Node 24 on an M1 MacBook Air (8 GB). All data stays in `backend/data/`.

## 0. Persistent local configuration (`.env`)

The backend reads **`backend/.env`** automatically. Its path is anchored to the backend folder in `app/core/config.py`, so it works even if `uvicorn` is started from another directory. You do **not** need to export variables in every Terminal window.

- `backend/.env.example` — documented placeholders (committed).
- `backend/.env` — this machine's real values (gitignored, never commit). It currently selects the local Ollama model and the local Piper binary/voice.
- Shell environment variables override `.env` (pydantic-settings precedence). If you previously exported a wrong `HOLOBOX_PIPER_*` value in a Terminal, `unset HOLOBOX_PIPER_BINARY HOLOBOX_PIPER_VOICE` or restart that shell. The backend now logs a warning and falls back to the real installation when a configured path is unusable, so a stale variable can no longer cause a 503. Check the `TTS diagnostics at startup` log line to see exactly which binary/voice the running process resolved.

If setting up a different machine, copy the example and edit it:

```bash
cd backend
cp .env.example .env
# edit .env: real Ollama model/endpoint and real Piper paths
```

## 1. Backend

```bash
cd backend
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

No `HOLOBOX_*` exports are needed — `.env` supplies them. Verify:

```bash
curl http://127.0.0.1:8000/api/v1/config/capabilities
```

Expected: `active_provider: "http"`, `llm_configured: true`, `tts_voices: ["en_US-lessac-medium"]`.

On first upload the app loads `sentence-transformers/all-MiniLM-L6-v2` (~90 MB) from the local cache. ChromaDB anonymous telemetry is disabled in code, so no usage events leave the machine.

## 2. Local LLM — Ollama

Start Ollama (the Ollama app is currently running; otherwise `ollama serve`). It listens on `http://127.0.0.1:11434` and exposes an OpenAI-compatible API at `/v1`.

Installed models checked on this machine: `gemma3:1b` (815 MB), `llama3.2:1b` (1.3 GB), `llama3.2:latest` (2.0 GB on disk, **2.6 GB loaded**), `nemotron-3-nano:4b` (2.8 GB), `qwen3:8b` (5.2 GB), `nomic-embed-text` (embeddings only — not used as the conversational LLM).

Benchmark with the same grounded prompt our RAG uses:

| Model | Loaded RAM | Answer quality | Latency |
|---|---|---|---|
| `gemma3:1b` | 879 MB | Hallucinated ("20,000 airports") | 2.6 s |
| `llama3.2:1b` | 1.5 GB | Partly correct, missed GPU and citations | 2.6 s |
| **`llama3.2:latest` (3.2B)** | **2.6 GB** | **Correct, complete, cites excerpts; refuses unrelated question** | **~5 s (first real upload query ~34 s incl. load + 17 chunks)** |
| `nemotron-3-nano:4b` | 2.8 GB | Correct but slow (thinking mode on by default), sloppy refusal text | 16–25 s |

**Selected: `llama3.2:latest`** — best quality-to-resource trade-off; `qwen3:8b` was excluded by size on an 8 GB machine. No models were downloaded.

`.env` holds:

```
HOLOBOX_LLM_PROVIDER=http
HOLOBOX_LLM_BASE_URL=http://127.0.0.1:11434/v1
HOLOBOX_LLM_MODEL=llama3.2:latest
HOLOBOX_LLM_TIMEOUT_SECONDS=120
```

This uses the existing generic OpenAI-compatible HTTP provider. If Ollama is stopped or out of memory, responses report `generation_mode: "unavailable"` with a warning; there is **no** mock fallback. The college provider remains available for later. Mock is available only by explicitly setting `HOLOBOX_LLM_PROVIDER=mock` in development, and is rejected in production.

To free GPU memory after experiments: `ollama stop <model>`. Ollama unloads idle models after ~5 minutes.

## 3. Local voice assets

**Piper (TTS).** The real installation is:

- Binary: `~/Desktop/piper/macos-piper/bin/piper` (executable; resolved via `@rpath`, no extra `DYLD_LIBRARY_PATH` needed)
- Voice: `~/Desktop/piper/en_US-lessac-medium.onnx` (+ `.onnx.json`)

The shorter path `~/Desktop/piper/piper` does **not** exist. Those real paths are in `backend/.env`; additionally, `Settings.discover_piper()` falls back to the same common locations if no variable is set. Verify synthesis through the API:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/synthesize \
  -H 'Content-Type: application/json' -H 'X-User-Id: local-user' \
  -d '{"text":"Hello from Holobox."}' -o /tmp/holobox.wav
file /tmp/holobox.wav    # RIFF (little-endian) WAVE audio
```

Audio is cached by SHA-256 of text+voice in `backend/data/audio_cache/`.

**Whisper (STT).** faster-whisper `base` is used on CPU/int8; it loads on first transcription. Language can be set in the app Settings or per request.

## 4. Frontend

```bash
cd frontend
npm install
npm run build && npm run electron:build
npm run electron
```

For live UI development: `npm run dev` and, in another terminal, `VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron`.

The backend URL/token/user id and voice preferences are stored by Electron in `userData/settings.json`; no secrets live in renderer code.

## 5. Verification commands

```bash
# Backend: 75 unit/integration tests (real MiniLM, ChromaDB, faster-whisper, Piper)
cd backend && .venv/bin/python -m pytest tests -q

# Frontend
cd frontend
npm run build
npm run electron:build
npm run check:api-types
```

Actual live checks performed on this machine:

```bash
# Real RAG answer with citations from GPU_Project_Report.pdf
curl -X POST http://127.0.0.1:8000/api/v1/documents \
  -F 'file=@/Users/deekshaa/Downloads/GPU_Project_Report.pdf' -F 'scope=user' \
  -H 'X-User-Id: local-user'
curl -X POST http://127.0.0.1:8000/api/v1/query -H 'Content-Type: application/json' \
  -H 'X-User-Id: local-user' \
  -d '{"question":"How many airports and routes are in the network, and which GPU was used?","owner_id":"local-user"}'
```

See `docs/IMPLEMENTATION_STATUS.md` for measured results.

## 6. Privacy and retention

Documents: `backend/data/uploads/` · vectors: `backend/data/chroma/` · conversations: `backend/data/holobox.db` · cached audio: `backend/data/audio_cache/` · temporary recordings: `backend/data/tmp/` (deleted after transcription). Only retrieved text excerpts are sent to the configured LLM; documents and audio are never uploaded elsewhere.
