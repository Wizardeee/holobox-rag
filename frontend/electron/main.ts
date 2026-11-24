import { app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface AppSettings {
  backendUrl: string;
  apiToken: string;
  userId: string;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  sttModel: string;
  ttsVoice: string;
  language: string;
  kioskToken: string;
  courseId: string;
  personDetectionEnabled: boolean;
  personDetectionConfidence: number;
  personDetectionIntervalMs: number;
  personPresenceMs: number;
  personAbsenceMs: number;
  greetingText: string;
}

// Development-only fallback. A packaged kiosk has NO localhost default: it must
// be configured with the MacBook's LAN address via kiosk-config.json or env.
const DEV_BACKEND_URL = 'http://127.0.0.1:8000';
const IS_DEV = Boolean(process.env.VITE_DEV_SERVER_URL);

const DEFAULT_SETTINGS: AppSettings = {
  backendUrl: process.env.HOLOBOX_BACKEND_URL || (IS_DEV ? DEV_BACKEND_URL : ''),
  apiToken: '',
  userId: 'local-user',
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  sttModel: 'base',
  ttsVoice: '',
  language: '',
  kioskToken: process.env.HOLOBOX_KIOSK_TOKEN || '',
  courseId: process.env.HOLOBOX_KIOSK_COURSE || '',
  personDetectionEnabled: process.env.HOLOBOX_PERSON_DETECTION_ENABLED !== 'false',
  personDetectionConfidence: Number(process.env.HOLOBOX_PERSON_CONFIDENCE || 0.6),
  personDetectionIntervalMs: Number(process.env.HOLOBOX_PERSON_INTERVAL_MS || 1000),
  personPresenceMs: Number(process.env.HOLOBOX_PERSON_PRESENCE_MS || 2000),
  personAbsenceMs: Number(process.env.HOLOBOX_PERSON_ABSENCE_MS || 5000),
  greetingText: process.env.HOLOBOX_GREETING_TEXT || 'Hi, how can I help you today?',
};

interface FilePart {
  fileName: string;
  type?: string;
  data: number[];
}

interface ApiRequest {
  path: string;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: Record<string, string | FilePart | undefined>;
}

// Local-only scheme for bundled MediaPipe WASM/model assets. Electron's
// file:// origin cannot fetch sibling files, so the renderer loads assets
// through this trusted, non-network protocol. It never contacts a server.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'holobox',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const configFile = () => path.join(app.getPath('userData'), 'kiosk-config.json');

const SAFE_KEYS: Array<keyof AppSettings> = [
  'courseId', 'language', 'voiceInputEnabled', 'voiceOutputEnabled', 'sttModel', 'ttsVoice',
  'personDetectionEnabled', 'personDetectionConfidence', 'personDetectionIntervalMs',
  'personPresenceMs', 'personAbsenceMs', 'greetingText',
];

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Creates a blank operator config on first run. Never overwrite an existing one. */
function ensureConfigFile(): void {
  if (fs.existsSync(configFile())) return;
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(
    configFile(),
    JSON.stringify(
      { backendUrl: '', kioskToken: '', courseId: process.env.HOLOBOX_KIOSK_COURSE || '' },
      null,
      2,
    ),
  );
}

function loadSettings(): AppSettings {
  const legacy = readJson(settingsFile());
  const safeLegacy = Object.fromEntries(
    SAFE_KEYS.filter((key) => key in legacy).map((key) => [key, legacy[key]]),
  );
  const operator = readJson(configFile());
  return {
    ...DEFAULT_SETTINGS,
    ...safeLegacy,
    ...operator,
    ...(process.env.HOLOBOX_BACKEND_URL ? { backendUrl: process.env.HOLOBOX_BACKEND_URL } : {}),
    ...(process.env.HOLOBOX_KIOSK_TOKEN ? { kioskToken: process.env.HOLOBOX_KIOSK_TOKEN } : {}),
  } as AppSettings;
}

function isConfigured(settings: AppSettings): boolean {
  return /^https?:\/\/[^\s]+/i.test(settings.backendUrl.trim());
}

/** The renderer never receives backendUrl, kioskToken or apiToken. */
function safeSettings() {
  const settings = loadSettings();
  const configured = isConfigured(settings);
  return {
    ...Object.fromEntries(SAFE_KEYS.map((key) => [key, settings[key]])),
    backendUrlConfigured: configured,
    configPath: configFile(),
    // Greeting needs the backend for Piper synthesis; disable it when unconfigured.
    personDetectionEnabled: configured && settings.personDetectionEnabled,
  };
}

function saveSettings(patch: Record<string, unknown>): void {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => SAFE_KEYS.includes(key as keyof AppSettings) && value !== undefined),
  );
  const next = { ...readJson(settingsFile()), ...clean };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
}

ipcMain.handle('settings:get', () => safeSettings());
ipcMain.handle('settings:set', (_event, patch: Record<string, unknown>) => {
  saveSettings(patch ?? {});
  return safeSettings();
});
ipcMain.handle('config:open', async () => {
  ensureConfigFile();
  const error = await shell.openPath(configFile());
  return error === '';
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.handle('api:request', async (_event, request: ApiRequest) => {
  const settings = loadSettings();
  if (!isConfigured(settings)) {
    return {
      ok: false,
      status: 0,
      data: { detail: { code: 'backend_not_configured', message: 'Backend URL is not configured' } },
    };
  }
  const pathname = request?.path ?? '';
  const allowedMethods = ['GET', 'POST', 'PATCH', 'DELETE'];
  const method = (request.method || 'GET').toUpperCase();
  if (!pathname.startsWith('/api/') || pathname.includes('..') || !allowedMethods.includes(method)) {
    return {
      ok: false,
      status: 400,
      data: { detail: { code: 'invalid_request', message: 'Invalid API request' } },
    };
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  const url = `${settings.backendUrl.replace(/\/$/, '')}${pathname}${suffix ? `?${suffix}` : ''}`;

  // Identity comes only from the operator-provisioned kiosk credential.
  const headers: Record<string, string> = {};
  const credential = settings.kioskToken || settings.apiToken;
  if (credential) headers.Authorization = `Bearer ${credential}`;

  let body: BodyInit | undefined;
  if (request.form) {
    const form = new FormData();
    for (const [key, value] of Object.entries(request.form)) {
      if (value === undefined) continue;
      if (typeof value === 'object' && Array.isArray(value.data)) {
        form.append(key, new Blob([new Uint8Array(value.data)], { type: value.type ?? 'application/octet-stream' }), value.fileName);
      } else {
        form.append(key, String(value));
      }
    }
    body = form;
  } else if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(request.body);
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(180000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('audio')
      ? Array.from(new Uint8Array(await response.arrayBuffer()))
      : await response.json().catch(() => ({ detail: { code: 'invalid_response', message: 'Backend returned invalid JSON' } }));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { detail: { code: 'network_error', message: `Cannot reach backend at ${settings.backendUrl}: ${String(error)}` } },
    };
  }
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    title: 'Holobox Kiosk',
    // The installer sets the executable/Start Menu icon via electron-builder.
    fullscreen: process.env.HOLOBOX_KIOSK_FULLSCREEN !== 'false',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  ensureConfigFile();
  const assetRoot = IS_DEV
    ? path.join(__dirname, '..', 'public')
    : path.join(__dirname, '..', 'dist');
  protocol.registerFileProtocol('holobox', (request, callback) => {
    const relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    const filePath = path.resolve(assetRoot, relative);
    if (!filePath.startsWith(path.resolve(assetRoot))) {
      callback({ statusCode: 403 });
      return;
    }
    callback({ path: filePath });
  });

  // Camera and microphone share the same explicit media permission.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
