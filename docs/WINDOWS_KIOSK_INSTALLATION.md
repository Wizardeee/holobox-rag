# Windows Holobox Kiosk — Installation and Operation

## Architecture reminder

The Windows mini PC runs **only** the Electron student kiosk. The MacBook runs
all AI/backend services: FastAPI, SQLite, ChromaDB, Ollama, faster-whisper,
Piper and the Teacher Admin Portal. The kiosk connects to the MacBook over the
local network. The MacBook must stay powered on, awake and connected to the same
reachable network whenever the Holobox is in use.

No Python, Node.js, Ollama, Whisper, Piper, ChromaDB or FastAPI is installed on
Windows by this installer.

## Installer

Built artifacts (gitignored, not committed):

```
frontend/installer/Holobox-Kiosk-0.1.1-x64.exe   <- CURRENT
frontend/installer/Holobox-Kiosk-0.1.0-x64.exe   <- previous release, retained
```

- Size: ~98 MB
- Current SHA-256 (v0.1.1): `4d828bdfbdf821d82d6e8736f35b30cd319377a98306d448f04cfd74e5b802c3`
- Previous SHA-256 (v0.1.0): `66c3728a447b0dfbf6c66e73938198c84251e7413cb7c5667dec654db9f08c1d`
- Target: Windows x64 (the application binary inside is PE32+ x86-64)
- Built with: `electron-builder` 25.1.8, NSIS target
- App name: **Holobox Kiosk** (`com.holobox.kiosk`)

**Architecture check limitation:** the actual Windows mini PC hardware was not
available during this build. x64 was built per the task requirement. Confirm
the mini PC is x64 (Windows Settings → System → About → System type) before
installing; if it is 32-bit or ARM, this installer must be rebuilt for that
architecture.

## Install

1. Copy `Holobox-Kiosk-0.1.1-x64.exe` to the Windows mini PC.
2. Double-click and follow the NSIS prompts. Installation is per-user by
   default; choose a destination when offered.
3. Start Menu shortcut: **Holobox Kiosk**. A desktop shortcut is also created.
4. Launch it. On first run it shows a **Setup required** screen. Nothing else
   happens until the backend connection is configured.

## Configure the MacBook backend connection (no rebuild)

The kiosk reads an operator-owned JSON file on first run and on every restart:

```
%APPDATA%\Holobox Kiosk\kiosk-config.json
```

The app explicitly sets its userData directory to `Holobox Kiosk` on both macOS
and Windows. Existing config files from older/generic directories are migrated
without overwriting valid targets; see `docs/CONFIGURATION.md`.

Open it with Notepad. Example (replace with your MacBook's actual LAN address):

```json
{
  "backendUrl": "http://192.0.2.10:8000",
  "kioskToken": "PASTE_KIOSK_TOKEN_FROM_MACBOOK_BACKEND_ENV",
  "courseId": "gpu-architecture"
}
```

- Never use `localhost` or `127.0.0.1` here: those refer to the Windows PC.
- The `kioskToken` is the value of `HOLOBOX_KIOSK_TOKEN` in
  `backend/.env` on the MacBook. Do not use the teacher password or the
  teacher token. Treat it like a password.
- The token is read only by the Electron main process and used as the
  `Authorization: Bearer …` header. It is never exposed to the React renderer,
  bundled in the app, or written to logs.
- Press **Reload configuration** in the setup screen after saving. The app can
  also be closed and reopened.
- The **Open configuration file** button opens the file with the default Windows
  handler (normally Notepad).

Find the MacBook LAN address:

```bash
ipconfig getifaddr en0        # on the MacBook
```

On the MacBook, start the backend for LAN access:

```bash
cd ~/Desktop/holobox-rag/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Ensure the MacBook firewall allows inbound TCP 8000 from the Holobox PC, and
both machines are on the same network. Do **not** expose port 8000 to the
public internet.

## Camera and microphone permissions

- **Camera (optional):** Windows Settings → Privacy & security → Camera →
  enable camera access and allow desktop apps. Approve any Electron camera
  prompt. If no camera exists or permission is denied, the kiosk continues
  normally and shows a small footer note: “Camera greeting unavailable — you
  can still ask questions.” Person detection never uploads frames anywhere.
- **Microphone (required for questions):** Windows Settings → Privacy &
  security → Microphone → enable access and allow desktop apps. Approve the
  Electron prompt. Camera failure does not affect microphone access.
- **Speakers:** ensure the Windows output device is working. Greeting and
  answer audio come from the MacBook's Piper backend as WAV over the network.

Camera detection runs locally using bundled MediaPipe WASM + EfficientDet-Lite0
(`dist/mediapipe/` inside the app) and is optional. The same installer works on
camera-equipped and camera-less PCs.

## Launch and fullscreen

The kiosk opens fullscreen by default. Use the Start Menu or desktop shortcut.
Close with `Alt+F4` (or Task Manager) for maintenance. Relaunch normally from
the shortcut. Application data, including `kiosk-config.json`, is preserved on
upgrade/uninstall (`deleteAppDataOnUninstall: false`).

## Optional environment overrides

For advanced launches from a terminal (not required for the installed shortcut):

| Variable | Purpose |
|---|---|
| `HOLOBOX_BACKEND_URL` | Override the config file backend URL |
| `HOLOBOX_KIOSK_TOKEN` | Override the kiosk credential |
| `HOLOBOX_KIOSK_FULLSCREEN=false` | Windowed mode for debugging |
| `HOLOBOX_PERSON_DETECTION_ENABLED=false` | Disable camera greeting |
| `HOLOBOX_PERSON_CONFIDENCE` | Detection threshold (default 0.6) |
| `HOLOBOX_PERSON_PRESENCE_MS` | Presence confirmation (default 2000) |
| `HOLOBOX_PERSON_ABSENCE_MS` | Absence confirmation (default 5000) |
| `HOLOBOX_GREETING_TEXT` | Greeting sentence |

## Troubleshooting

| Symptom | Action |
|---|---|
| “Setup required” | Fill in `kiosk-config.json` and reload. |
| “Backend unavailable” | Check MacBook is on, backend bound `0.0.0.0`, firewall allows 8000, URL is the MacBook LAN IP. |
| 401 / unauthorised | Kiosk token is wrong or rotated; copy the current `HOLOBOX_KIOSK_TOKEN` from the MacBook `.env`. |
| 403 / course not permitted | Set `courseId` to a course permitted for the kiosk, or clear it to use the first available course. |
| Camera note shown | Denied/missing camera; microphone and questions still work. Check Windows camera privacy settings. |
| No greeting | Person must be visible for ~2 s; check lighting/distance. Detection is approximate. |
| Avatar blank | Confirm WebGL/hardware acceleration is enabled on the Windows PC. |
| Microphone silent | Check Windows microphone privacy and default input device. |

## Update or reinstall

Copy the new installer to the PC and run it over the existing installation.
`kiosk-config.json` and other user data are retained. If behaviour is corrupt,
uninstall, then reinstall and re-enter the backend URL and token.

## Windows verification checklist (to perform on the mini PC)

This build was produced and statically verified on macOS; it was **not** run on
Windows hardware. Before the college demonstration, verify on the mini PC:

1. Installer runs and completes.
2. Kiosk launches fullscreen.
3. Avatar, textures and MediaPipe assets load (no WebGL/loader errors).
4. Idle and speaking animations work.
5. Microphone records and a question reaches the MacBook backend.
6. Answer audio plays and the avatar speaks; stop control works.
7. Camera available + permission granted: one greeting on approach, no repeats,
   new greeting after leaving and returning.
8. Camera denied/unplugged: kiosk still answers questions normally.
9. Backend stopped: clear “Backend unavailable” status, no crash.
10. Close and relaunch: configuration retained.
