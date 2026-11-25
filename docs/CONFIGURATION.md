# Kiosk Configuration — macOS Development vs Windows Production

The same Electron/React application supports two distinct workflows. Platform
behaviour is chosen with `app.isPackaged`, **not** with the presence of a Vite
dev-server URL.

## App-specific user-data directory

Both environments use an application-specific directory:

- macOS: `~/Library/Application Support/Holobox Kiosk/`
- Windows: `%APPDATA%\Holobox Kiosk\`

The generic `Application Support/Electron/` directory is not used. On startup,
existing `kiosk-config.json` / `settings.json` files from older locations
(`Electron`, `Holobox RAG`, `holobox-kiosk`) are copied into the new directory
**only when the target file does not already exist**. An old valid backend URL /
kiosk token is migrated into a new `kiosk-config.json` only if no production
config exists. Nothing is overwritten silently.

## macOS development (unpackaged)

`npm run electron` (from `frontend/`) is a development launch. The app:

- opens directly into the normal student kiosk UI;
- does **not** show the Windows administrator setup screen;
- uses `HOLOBOX_BACKEND_URL` if set, otherwise `http://127.0.0.1:8000`;
- uses `HOLOBOX_KIOSK_TOKEN` if set, otherwise reads the local, gitignored
  `backend/.env` token (dev only — never in a packaged build);
- uses the separate dev config file
  `~/Library/Application Support/Holobox Kiosk/kiosk-config.dev.json`;
- keeps dev preferences in `settings.dev.json`.

`VITE_DEV_SERVER_URL` only controls whether the renderer is loaded from the Vite
dev server; it no longer controls whether setup is required.

For the traditional dev workflow:

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
cd ../frontend && npm run electron:build && npm run electron
```

Optional: `VITE_DEV_SERVER_URL=http://127.0.0.1:5173 npm run electron` with
`npm run dev` running in another terminal.

## Windows production (packaged installer)

The packaged app is the Holobox student kiosk:

- opens fullscreen in the normal kiosk UI when configured;
- has **no localhost fallback**;
- uses `%APPDATA%\Holobox Kiosk\kiosk-config.json`;
- reads the kiosk token only in Electron main and never exposes it to the
  renderer, console or frontend bundle;
- shows the administrator setup screen only when no valid `backendUrl` exists;
- remembers the config across restarts.

First-run config example:

```json
{
  "backendUrl": "http://192.0.2.10:8000",
  "kioskToken": "PASTE_KIOSK_TOKEN_FROM_MACBOOK_BACKEND_ENV",
  "courseId": "gpu-architecture"
}
```

Replace `192.0.2.10` with the MacBook's actual LAN address. Environment
variables override the file for advanced launches.

## Privacy / security

- Dev token fallback reads the local `backend/.env` only when `app.isPackaged`
  is false.
- Production config and credentials are never committed or bundled.
- Renderer settings contain only non-secret values (`backendUrlConfigured`,
  `configPath`, preferences); no raw URL or token.
- Camera and microphone permissions are handled independently in Electron main.

See `docs/WINDOWS_KIOSK_INSTALLATION.md` for the Windows install checklist and
`docs/setup.md` for backend setup.
