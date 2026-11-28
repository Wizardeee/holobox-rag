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
  personDetectionEnabled: boolean;
  personDetectionConfidence: number;
  personDetectionIntervalMs: number;
  personPresenceMs: number;
  personAbsenceMs: number;
  greetingText: string;
}

// Explicit app identity: never use Electron's generic userData directory.
const APP_NAME = 'Holobox Kiosk';
app.setName(APP_NAME);
const APP_DATA_ROOT = app.getPath('appData');
const USER_DATA_DIR = path.join(APP_DATA_ROOT, APP_NAME);
app.setPath('userData', USER_DATA_DIR);

// Development-only fallback. A PACKAGED kiosk has NO localhost default: it must
// be configured with the MacBook's LAN address via kiosk-config.json or env.
// `app.isPackaged` is the reliable signal; VITE_DEV_SERVER_URL only controls
// whether the renderer is loaded from the Vite dev server.
const DEV_BACKEND_URL = 'http://127.0.0.1:8000';
const IS_PACKAGED = app.isPackaged;
const USE_DEV_SERVER = Boolean(process.env.VITE_DEV_SERVER_URL);

/** Dev convenience only: read the local backend's kiosk token, never in a packaged app. */
function localDevKioskToken(): string {
  if (IS_PACKAGED) return '';
  try {
    const backendEnv = path.join(__dirname, '..', '..', 'backend', '.env');
    const contents = fs.readFileSync(backendEnv, 'utf8');
    const match = /^HOLOBOX_KIOSK_TOKEN=(.*)$/m.exec(contents);
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  backendUrl: process.env.HOLOBOX_BACKEND_URL || (IS_PACKAGED ? '' : DEV_BACKEND_URL),
  apiToken: '',
  userId: 'local-user',
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  sttModel: 'base',
  ttsVoice: '',
  language: '',
  kioskToken: process.env.HOLOBOX_KIOSK_TOKEN || localDevKioskToken(),
  personDetectionEnabled: process.env.HOLOBOX_PERSON_DETECTION_ENABLED !== 'false',
  personDetectionConfidence: Number(process.env.HOLOBOX_PERSON_CONFIDENCE || 0.5),
  personDetectionIntervalMs: Number(process.env.HOLOBOX_PERSON_INTERVAL_MS || 600),
  personPresenceMs: Number(process.env.HOLOBOX_PERSON_PRESENCE_MS || 1200),
  personAbsenceMs: Number(process.env.HOLOBOX_PERSON_ABSENCE_MS || 3000),
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

// Development and production use separate config files in the same app-specific dir.
const SETTINGS_FILE_NAME = IS_PACKAGED ? 'settings.json' : 'settings.dev.json';
const CONFIG_FILE_NAME = IS_PACKAGED ? 'kiosk-config.json' : 'kiosk-config.dev.json';
const settingsFile = () => path.join(USER_DATA_DIR, SETTINGS_FILE_NAME);
const configFile = () => path.join(USER_DATA_DIR, CONFIG_FILE_NAME);

/**
 * Migrate configs from older/generic Electron userData locations without ever
 * overwriting an existing target. Legacy settings.json may contain the old
 * backend URL/token; those are copied into a NEW production config only when
 * none exists, so existing deployments keep working after upgrade.
 */
function migrateLegacyConfigs(): void {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const legacyDirs = [
    path.join(APP_DATA_ROOT, 'Electron'),
    path.join(APP_DATA_ROOT, 'Holobox RAG'),
    path.join(APP_DATA_ROOT, 'holobox-kiosk'),
    path.join(APP_DATA_ROOT, 'holobox-rag-frontend'),
  ];
  const prodConfig = path.join(USER_DATA_DIR, 'kiosk-config.json');
  const prodSettings = path.join(USER_DATA_DIR, 'settings.json');

  for (const legacyDir of legacyDirs) {
    if (!fs.existsSync(legacyDir)) continue;
    for (const name of ['kiosk-config.json', 'settings.json']) {
      const source = path.join(legacyDir, name);
      const target = path.join(USER_DATA_DIR, name);
      if (fs.existsSync(source) && !fs.existsSync(target)) {
        try {
          fs.copyFileSync(source, target);
          console.log(`Migrated ${name} from ${legacyDir}`);
        } catch (error) {
          console.warn(`Could not migrate ${name}: ${String(error)}`);
        }
      }
    }
  }

  if (fs.existsSync(prodConfig)) return;
  let remembered: Record<string, unknown> = {};
  for (const legacyDir of legacyDirs) {
    for (const name of ['kiosk-config.json', 'settings.json']) {
      const source = path.join(legacyDir, name);
      if (!fs.existsSync(source)) continue;
      remembered = { ...readJson(source), ...remembered };
    }
  }
  const backendUrl = remembered.backendUrl;
  const kioskToken = remembered.kioskToken ?? remembered.apiToken;
  if (typeof backendUrl === 'string' && backendUrl.trim()) {
    fs.writeFileSync(
      prodConfig,
      JSON.stringify(
        {
          backendUrl,
          kioskToken: typeof kioskToken === 'string' ? kioskToken : '',
        },
        null,
        2,
      ),
    );
    console.log('Migrated remembered backend configuration to kiosk-config.json');
  }
}

const SAFE_KEYS: Array<keyof AppSettings> = [
  'language', 'voiceInputEnabled', 'voiceOutputEnabled', 'sttModel', 'ttsVoice',
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

/** Creates a first-run config. Dev gets localhost; production stays unconfigured. */
function ensureConfigFile(): void {
  if (fs.existsSync(configFile())) return;
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(
    configFile(),
    JSON.stringify(
      {
        backendUrl: IS_PACKAGED ? '' : DEV_BACKEND_URL,
        kioskToken: '',
      },
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
  // Obsolete keys from older configs (for example `courseId`) are ignored:
  // only SAFE_KEYS are ever exposed to the renderer or persisted again.
  // An empty backendUrl in a DEV config means "use the local default"; in a
  // packaged app it deliberately means "not configured" (show setup screen).
  const usableOperator = IS_PACKAGED
    ? operator
    : Object.fromEntries(
        Object.entries(operator).filter(
          ([key, value]) =>
            !((key === 'backendUrl' || key === 'kioskToken' || key === 'apiToken') && !value),
        ),
      );
  return {
    ...DEFAULT_SETTINGS,
    ...safeLegacy,
    ...usableOperator,
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
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  packaged: IS_PACKAGED,
  userDataPath: USER_DATA_DIR,
  configPath: configFile(),
}));

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
  migrateLegacyConfigs();
  ensureConfigFile();
  const assetRoot = USE_DEV_SERVER
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
