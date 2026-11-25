"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// Explicit app identity: never use Electron's generic userData directory.
const APP_NAME = 'Holobox Kiosk';
electron_1.app.setName(APP_NAME);
const APP_DATA_ROOT = electron_1.app.getPath('appData');
const USER_DATA_DIR = node_path_1.default.join(APP_DATA_ROOT, APP_NAME);
electron_1.app.setPath('userData', USER_DATA_DIR);
// Development-only fallback. A PACKAGED kiosk has NO localhost default: it must
// be configured with the MacBook's LAN address via kiosk-config.json or env.
// `app.isPackaged` is the reliable signal; VITE_DEV_SERVER_URL only controls
// whether the renderer is loaded from the Vite dev server.
const DEV_BACKEND_URL = 'http://127.0.0.1:8000';
const IS_PACKAGED = electron_1.app.isPackaged;
const USE_DEV_SERVER = Boolean(process.env.VITE_DEV_SERVER_URL);
/** Dev convenience only: read the local backend's kiosk token, never in a packaged app. */
function localDevKioskToken() {
    if (IS_PACKAGED)
        return '';
    try {
        const backendEnv = node_path_1.default.join(__dirname, '..', '..', 'backend', '.env');
        const contents = node_fs_1.default.readFileSync(backendEnv, 'utf8');
        const match = /^HOLOBOX_KIOSK_TOKEN=(.*)$/m.exec(contents);
        return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
    }
    catch {
        return '';
    }
}
const DEFAULT_SETTINGS = {
    backendUrl: process.env.HOLOBOX_BACKEND_URL || (IS_PACKAGED ? '' : DEV_BACKEND_URL),
    apiToken: '',
    userId: 'local-user',
    voiceInputEnabled: true,
    voiceOutputEnabled: true,
    sttModel: 'base',
    ttsVoice: '',
    language: '',
    kioskToken: process.env.HOLOBOX_KIOSK_TOKEN || localDevKioskToken(),
    courseId: process.env.HOLOBOX_KIOSK_COURSE || '',
    personDetectionEnabled: process.env.HOLOBOX_PERSON_DETECTION_ENABLED !== 'false',
    personDetectionConfidence: Number(process.env.HOLOBOX_PERSON_CONFIDENCE || 0.6),
    personDetectionIntervalMs: Number(process.env.HOLOBOX_PERSON_INTERVAL_MS || 1000),
    personPresenceMs: Number(process.env.HOLOBOX_PERSON_PRESENCE_MS || 2000),
    personAbsenceMs: Number(process.env.HOLOBOX_PERSON_ABSENCE_MS || 5000),
    greetingText: process.env.HOLOBOX_GREETING_TEXT || 'Hi, how can I help you today?',
};
// Local-only scheme for bundled MediaPipe WASM/model assets. Electron's
// file:// origin cannot fetch sibling files, so the renderer loads assets
// through this trusted, non-network protocol. It never contacts a server.
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: 'holobox',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
]);
// Development and production use separate config files in the same app-specific dir.
const SETTINGS_FILE_NAME = IS_PACKAGED ? 'settings.json' : 'settings.dev.json';
const CONFIG_FILE_NAME = IS_PACKAGED ? 'kiosk-config.json' : 'kiosk-config.dev.json';
const settingsFile = () => node_path_1.default.join(USER_DATA_DIR, SETTINGS_FILE_NAME);
const configFile = () => node_path_1.default.join(USER_DATA_DIR, CONFIG_FILE_NAME);
/**
 * Migrate configs from older/generic Electron userData locations without ever
 * overwriting an existing target. Legacy settings.json may contain the old
 * backend URL/token; those are copied into a NEW production config only when
 * none exists, so existing deployments keep working after upgrade.
 */
function migrateLegacyConfigs() {
    node_fs_1.default.mkdirSync(USER_DATA_DIR, { recursive: true });
    const legacyDirs = [
        node_path_1.default.join(APP_DATA_ROOT, 'Electron'),
        node_path_1.default.join(APP_DATA_ROOT, 'Holobox RAG'),
        node_path_1.default.join(APP_DATA_ROOT, 'holobox-kiosk'),
        node_path_1.default.join(APP_DATA_ROOT, 'holobox-rag-frontend'),
    ];
    const prodConfig = node_path_1.default.join(USER_DATA_DIR, 'kiosk-config.json');
    const prodSettings = node_path_1.default.join(USER_DATA_DIR, 'settings.json');
    for (const legacyDir of legacyDirs) {
        if (!node_fs_1.default.existsSync(legacyDir))
            continue;
        for (const name of ['kiosk-config.json', 'settings.json']) {
            const source = node_path_1.default.join(legacyDir, name);
            const target = node_path_1.default.join(USER_DATA_DIR, name);
            if (node_fs_1.default.existsSync(source) && !node_fs_1.default.existsSync(target)) {
                try {
                    node_fs_1.default.copyFileSync(source, target);
                    console.log(`Migrated ${name} from ${legacyDir}`);
                }
                catch (error) {
                    console.warn(`Could not migrate ${name}: ${String(error)}`);
                }
            }
        }
    }
    if (node_fs_1.default.existsSync(prodConfig))
        return;
    let remembered = {};
    for (const legacyDir of legacyDirs) {
        for (const name of ['kiosk-config.json', 'settings.json']) {
            const source = node_path_1.default.join(legacyDir, name);
            if (!node_fs_1.default.existsSync(source))
                continue;
            remembered = { ...readJson(source), ...remembered };
        }
    }
    const backendUrl = remembered.backendUrl;
    const kioskToken = remembered.kioskToken ?? remembered.apiToken;
    const courseId = remembered.courseId;
    if (typeof backendUrl === 'string' && backendUrl.trim()) {
        node_fs_1.default.writeFileSync(prodConfig, JSON.stringify({
            backendUrl,
            kioskToken: typeof kioskToken === 'string' ? kioskToken : '',
            courseId: typeof courseId === 'string' ? courseId : '',
        }, null, 2));
        console.log('Migrated remembered backend configuration to kiosk-config.json');
    }
}
const SAFE_KEYS = [
    'courseId', 'language', 'voiceInputEnabled', 'voiceOutputEnabled', 'sttModel', 'ttsVoice',
    'personDetectionEnabled', 'personDetectionConfidence', 'personDetectionIntervalMs',
    'personPresenceMs', 'personAbsenceMs', 'greetingText',
];
function readJson(file) {
    try {
        return JSON.parse(node_fs_1.default.readFileSync(file, 'utf8'));
    }
    catch {
        return {};
    }
}
/** Creates a first-run config. Dev gets localhost; production stays unconfigured. */
function ensureConfigFile() {
    if (node_fs_1.default.existsSync(configFile()))
        return;
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(configFile()), { recursive: true });
    node_fs_1.default.writeFileSync(configFile(), JSON.stringify({
        backendUrl: IS_PACKAGED ? '' : DEV_BACKEND_URL,
        kioskToken: '',
        courseId: process.env.HOLOBOX_KIOSK_COURSE || '',
    }, null, 2));
}
function loadSettings() {
    const legacy = readJson(settingsFile());
    const safeLegacy = Object.fromEntries(SAFE_KEYS.filter((key) => key in legacy).map((key) => [key, legacy[key]]));
    const operator = readJson(configFile());
    // An empty backendUrl in a DEV config means "use the local default"; in a
    // packaged app it deliberately means "not configured" (show setup screen).
    const usableOperator = IS_PACKAGED
        ? operator
        : Object.fromEntries(Object.entries(operator).filter(([key, value]) => !((key === 'backendUrl' || key === 'kioskToken' || key === 'apiToken') && !value)));
    return {
        ...DEFAULT_SETTINGS,
        ...safeLegacy,
        ...usableOperator,
        ...(process.env.HOLOBOX_BACKEND_URL ? { backendUrl: process.env.HOLOBOX_BACKEND_URL } : {}),
        ...(process.env.HOLOBOX_KIOSK_TOKEN ? { kioskToken: process.env.HOLOBOX_KIOSK_TOKEN } : {}),
    };
}
function isConfigured(settings) {
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
function saveSettings(patch) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([key, value]) => SAFE_KEYS.includes(key) && value !== undefined));
    const next = { ...readJson(settingsFile()), ...clean };
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(settingsFile()), { recursive: true });
    node_fs_1.default.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
}
electron_1.ipcMain.handle('settings:get', () => safeSettings());
electron_1.ipcMain.handle('settings:set', (_event, patch) => {
    saveSettings(patch ?? {});
    return safeSettings();
});
electron_1.ipcMain.handle('config:open', async () => {
    ensureConfigFile();
    const error = await electron_1.shell.openPath(configFile());
    return error === '';
});
electron_1.ipcMain.handle('app:info', () => ({
    version: electron_1.app.getVersion(),
    platform: process.platform,
    packaged: IS_PACKAGED,
    userDataPath: USER_DATA_DIR,
    configPath: configFile(),
}));
electron_1.ipcMain.handle('api:request', async (_event, request) => {
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
        if (value !== undefined && value !== '')
            query.set(key, String(value));
    }
    const suffix = query.toString();
    const url = `${settings.backendUrl.replace(/\/$/, '')}${pathname}${suffix ? `?${suffix}` : ''}`;
    // Identity comes only from the operator-provisioned kiosk credential.
    const headers = {};
    const credential = settings.kioskToken || settings.apiToken;
    if (credential)
        headers.Authorization = `Bearer ${credential}`;
    let body;
    if (request.form) {
        const form = new FormData();
        for (const [key, value] of Object.entries(request.form)) {
            if (value === undefined)
                continue;
            if (typeof value === 'object' && Array.isArray(value.data)) {
                form.append(key, new Blob([new Uint8Array(value.data)], { type: value.type ?? 'application/octet-stream' }), value.fileName);
            }
            else {
                form.append(key, String(value));
            }
        }
        body = form;
    }
    else if (request.body !== undefined) {
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
    }
    catch (error) {
        return {
            ok: false,
            status: 0,
            data: { detail: { code: 'network_error', message: `Cannot reach backend at ${settings.backendUrl}: ${String(error)}` } },
        };
    }
});
function createWindow() {
    const window = new electron_1.BrowserWindow({
        width: 1240,
        height: 840,
        minWidth: 920,
        minHeight: 620,
        title: 'Holobox Kiosk',
        // The installer sets the executable/Start Menu icon via electron-builder.
        fullscreen: process.env.HOLOBOX_KIOSK_FULLSCREEN !== 'false',
        autoHideMenuBar: true,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        void window.loadFile(node_path_1.default.join(__dirname, '..', 'dist', 'index.html'));
    }
}
electron_1.app.whenReady().then(() => {
    migrateLegacyConfigs();
    ensureConfigFile();
    const assetRoot = USE_DEV_SERVER
        ? node_path_1.default.join(__dirname, '..', 'public')
        : node_path_1.default.join(__dirname, '..', 'dist');
    electron_1.protocol.registerFileProtocol('holobox', (request, callback) => {
        const relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
        const filePath = node_path_1.default.resolve(assetRoot, relative);
        if (!filePath.startsWith(node_path_1.default.resolve(assetRoot))) {
            callback({ statusCode: 403 });
            return;
        }
        callback({ path: filePath });
    });
    // Camera and microphone share the same explicit media permission.
    electron_1.session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'media');
    });
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
