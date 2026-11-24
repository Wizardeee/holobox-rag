# Setup (macOS development)

Tested on macOS with Python 3.12 and Node 24 on an M1 MacBook Air (8 GB). All data stays in `backend/data/`.

## 1. Backend

```bash
cd backend
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional: override defaults
```

Start it:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Verify: `curl http://127.0.0.1:8000/api/v1/health` → `{"status":"ok",...}`.

On first upload the app downloads `sentence-transformers/all-MiniLM-L6-v2` (about 90 MB) into the Hugging Face cache. Whisper `base` and a Piper voice are used only when voice features are exercised.

## 2. Local model assets for voice

- STT: faster-whisper `base` (set `HOLOBOX_STT_MODEL`, default `base`). It downloads to `~/.cache/whisper` on first transcription. CPU/int8 is used by default.
- TTS: set both variables to your Piper binary and voice model:

```bash
export HOLOBOX_PIPER_BINARY="$HOME/Desktop/piper/macos-piper/bin/piper"
export HOLOBOX_PIPER_VOICE="$HOME/Desktop/piper/en_US-lessac-medium.onnx"
```

Without these, `/api/v1/synthesize` returns `503 tts_unavailable`; text chat and transcription still work.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev                    # Vite dev server on http://localhost:5173
```

In a second terminal, launch the desktop window:

```bash
cd frontend
npm run electron:build
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron
```

For a production-style launch (loads the built `dist/`): `npm run build && npm run electron:build && npm run electron`.

The backend URL, optional API token, user id, voice toggles, STT model and Piper voice are configured in the app's Settings screen and stored in Electron's `userData/settings.json` — never in renderer code or the repository.

## 4. Verification commands

```bash
# Backend (all tests, including real MiniLM, ChromaDB, faster-whisper and Piper checks)
cd backend && .venv/bin/python -m pytest tests -q

# Frontend
cd frontend
npm run build                  # TypeScript + Vite production build
npm run electron:build         # compile main/preload
npm run check:api-types        # fail if generated types are stale
```

## 5. Connecting a real LLM

No college endpoint is assumed. To use any OpenAI-compatible HTTP endpoint:

```bash
export HOLOBOX_LLM_PROVIDER=http
export HOLOBOX_LLM_BASE_URL="https://your-endpoint.example/v1"   # supply the real value
export HOLOBOX_LLM_API_KEY="..."                                 # from a secret store, not the repo
export HOLOBOX_LLM_MODEL="..."
```

When the college publishes its actual API specification, replace `backend/app/llm/college.py` with the real adapter ( endpoint, auth and payload from their docs) and select `HOLOBOX_LLM_PROVIDER=college`. Until then that provider reports `unavailable` honestly and never fabricates answers. The mock provider is rejected at startup when `HOLOBOX_ENVIRONMENT=production`, and every mock answer is labelled as test output.

## 6. Privacy and retention

- Documents: `backend/data/uploads/{id}/`
- Vectors: `backend/data/chroma/`
- Conversations: `backend/data/holobox.db`
- Cached TTS audio: `backend/data/audio_cache/` (keyed by text+voice)
- Temporary recordings: `backend/data/tmp/` (deleted immediately after transcription)

Nothing is uploaded to an external service unless a non-mock LLM provider is explicitly configured; documents are never sent to the LLM, only retrieved text excerpts inside the prompt.
