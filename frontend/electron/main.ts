import { app, BrowserWindow, ipcMain, session } from 'electron';
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
}

const DEFAULT_SETTINGS: AppSettings = {
  backendUrl: process.env.HOLOBOX_BACKEND_URL || 'http://127.0.0.1:8000',
  apiToken: '',
  userId: 'local-user',
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  sttModel: 'base',
  ttsVoice: '',
  language: '',
  kioskToken: process.env.HOLOBOX_KIOSK_TOKEN || '',
  courseId: process.env.HOLOBOX_KIOSK_COURSE || '',
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

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>) => saveSettings(patch));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.handle('api:request', async (_event, request: ApiRequest) => {
  const settings = loadSettings();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  const url = `${settings.backendUrl.replace(/\/$/, '')}${request.path}${suffix ? `?${suffix}` : ''}`;

  // Identity comes only from the provisioned kiosk credential.
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
      method: request.method ?? 'GET',
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
    title: 'Holobox Student Kiosk',
    fullscreen: process.env.HOLOBOX_KIOSK_FULLSCREEN !== 'false',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Microphone access is explicit and limited to media capabilities.
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
