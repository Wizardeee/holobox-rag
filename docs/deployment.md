# Deployment

## macOS development (verified)

See `setup.md`. The backend runs on 127.0.0.1:8000 and the Electron client loads the built UI from `dist/`.

## Holobox deployment (prepared, not yet tested on Windows)

Target shape:

```
Holobox Windows PC  --HTTP/WebSocket over LAN-->  Backend on laptop/server
   (Electron UI)                                  FastAPI + ChromaDB + models
```

### Backend on the AI machine

```bash
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
set HOLOBOX_HOST=0.0.0.0
set HOLOBOX_PORT=8000
set HOLOBOX_API_TOKEN=<long-random-token>
set HOLOBOX_ENVIRONMENT=production
set HOLOBOX_LLM_PROVIDER=http     # or college once its API is known
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Production refuses the mock provider. Place the backend behind the local network only; configure the OS firewall to the Holobox IP. The API token must be distributed to the client out of band, never committed.

Windows voice assets must be provisioned separately: a Windows Piper executable and voice model (`HOLOBOX_PIPER_BINARY`/`HOLOBOX_PIPER_VOICE`), and a CPU-compatible faster-whisper model. The macOS binary in this repo's development notes will not run on Windows.

### Desktop client packaging

`frontend/package.json` configures `electron-builder` with an NSIS Windows target and a DMG macOS target:

```bash
cd frontend
npm install
npm run build && npm run electron:build
npx electron-builder --win nsis
```

The installer will be written under `frontend/dist_electron_installer/` (default electron-builder output). The client needs only the backend URL and token in its Settings screen; all backend logic stays server-side.

### Status of verification

Windows packaging is **prepared but not verified**. No Windows machine or Windows Piper/faster-whisper assets were available in this environment. Electron security flags, LAN URLs, token auth and cross-machine behaviour are designed for it but must be tested on the actual Holobox PC before claiming compatibility.

## Future avatar client

The API in `docs/api.md` is the complete integration surface: submit text (`/query`), submit audio (`/transcribe`), receive answers with citations, receive audio (`/synthesize`), and capabilities discovery. No avatar-specific code or dependencies exist in the backend. Add lip-sync/animation in the separate client; optionally add `WS /api/v1/ws/query` for token streaming without changing existing endpoints.
