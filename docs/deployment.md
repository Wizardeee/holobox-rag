# Deployment

## Architecture recap (MVP)

```
MacBook (this machine)                         Holobox Windows PC
----------------------                         ------------------
FastAPI  :8000  ─── LAN HTTP ────────────────►  Electron student kiosk
SQLite + ChromaDB                               Three.js avatar
Ollama   :11434 (llama3.2:latest)               microphone + playback
faster-whisper + Piper
Teacher portal (Vite :5174, proxies /api)
```

The MacBook must stay awake, online and on the same LAN for the whole demo. Nothing
is exposed to the public internet.

## A. MacBook — backend (all AI processing)

```bash
cd ~/Desktop/holobox-rag/backend
source .venv/bin/activate
ollama serve &                       # or launch the Ollama app
ollama pull llama3.2:latest          # only if missing; installed here already
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For localhost-only development use `--host 127.0.0.1`. For LAN mode, bind `0.0.0.0`,
set `HOLOBOX_CORS_ORIGINS` in `backend/.env` to include the teacher portal origin
(e.g. `http://192.0.2.10:5174`) and keep the OS firewall restricted to the LAN.

Find this machine's LAN address:

```bash
ipconfig getifaddr en0              # e.g. 192.0.2.10 on this MacBook
# or: hostname                      # Deekshas-MacBook-Air.local
```

`backend/.env` (gitignored) holds the teacher password hash, auth secret, kiosk
token, Piper paths and Ollama endpoint. Never copy it to the Windows PC.

## B. MacBook — teacher portal (browser)

```bash
cd ~/Desktop/holobox-rag/frontend
npm install
npm run dev:teacher -- --host 0.0.0.0
```

Open `http://<MacBook-LAN-IP>:5174/teacher.html` on the MacBook (or any machine on
the LAN). Vite proxies `/api` to `VITE_BACKEND_URL` (default
`http://127.0.0.1:8000`), so browser CORS is not an issue and the backend URL is
not compiled into the client bundle. Sign in with the teacher account configured
by `HOLOBOX_TEACHER_USERNAME` / `HOLOBOX_TEACHER_PASSWORD_HASH`.

Generate a new hash:

```bash
cd ~/Desktop/holobox-rag/backend
python -m scripts.hash_password "new-password"
```

## C. Windows Holobox PC — student kiosk only

1. Install Node 22+, then `npm install` in the copied `frontend/` folder.
2. Build once: `npm run build && npm run electron:build`.
3. Set the connection values in the shell that launches Electron:

```powershell
$env:HOLOBOX_BACKEND_URL = "http://192.0.2.10:8000"   # use the MacBook's actual IP
$env:HOLOBOX_KIOSK_TOKEN = "<the kiosk token from backend/.env>"
$env:HOLOBOX_KIOSK_COURSE = "gpu-architecture"
npm run electron
```

`HOLOBOX_BACKEND_URL` and the credential are never hardcoded in renderer code:
Electron main reads them from the environment / local settings and injects the
bearer header in its IPC bridge. The kiosk opens fullscreen; set
`HOLOBOX_KIOSK_FULLSCREEN=false` for development.

The avatar model is copied to `frontend/public/avatar/business-female-04.vrm` (a
VRM 0.x / glTF 2.0 binary, MIT licensed) and bundled into `dist/avatar/`. Its
rig, viseme morphs and expression morphs are read from the asset at runtime.
To use a different asset, set `VITE_AVATAR_MODEL_URL` at build time. Keep the
original downloaded model unchanged.

**Not verified:** Windows hardware, Windows Piper/faster-whisper binaries and
cross-device LAN behaviour were not tested here (no Windows PC available). The
electron-builder NSIS target is configured but no Windows installer was produced.
Windows only needs a browser-capable PC with WebGL; all inference stays on the
MacBook.

## D. Phase 2 — future college server

Move the backend, `backend/data/` (SQLite + ChromaDB) and the AI services to a
college server. Point both clients at the server via `HOLOBOX_BACKEND_URL` / Vite
proxy target and include their origins in `HOLOBOX_CORS_ORIGINS`. Keep the token
auth; rotate the shared kiosk credential and teacher secret. No application code
changes are required for the move. Do not expose the server to the public internet
without TLS, a real identity provider and a security review.

## E. Troubleshooting

- "Backend offline" in kiosk: check `HOLOBOX_BACKEND_URL`, firewall, and that the backend bound `0.0.0.0`.
- 401 in teacher portal: token expired (8 h) — sign in again; check `HOLOBOX_TEACHER_*` hash.
- 403 on kiosk query: selected course is not in `HOLOBOX_KIOSK_COURSES` or the document is unapproved.
- Avatar blank: verify `dist/avatar/sabrina_3d_avatar.glb` exists and WebGL is enabled.
- Microphone errors: grant microphone permission to Electron on the kiosk PC.
- Camera greeting: optional and local-only; see `docs/PERSON_DETECTION.md`. A
  camera-less kiosk needs no extra configuration — set
  `HOLOBOX_PERSON_DETECTION_ENABLED=false` or simply leave no camera connected.
  The WASM/model assets are bundled in `dist/mediapipe/` and served through the
  app's local `holobox://assets/` protocol; no Python/vision packages are needed
  on Windows.

## F. Windows kiosk installer (built, not Windows-tested)

`electron-builder` NSIS produces `frontend/installer/Holobox-Kiosk-0.1.2-x64.exe` (v0.1.2; older installers retained)
(`npm run dist:win`). The Windows PC runs only Electron + the bundled frontend,
Three.js avatar, MediaPipe WASM/model and local camera greeting. Configure the
MacBook LAN URL and kiosk token in `%APPDATA%\Holobox Kiosk\kiosk-config.json`;
no rebuild is needed. Full instructions and the Windows hardware verification
checklist are in `docs/WINDOWS_KIOSK_INSTALLATION.md`. The actual mini PC was
not available, so Windows execution remains unverified.
