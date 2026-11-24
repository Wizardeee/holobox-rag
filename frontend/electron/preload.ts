import { contextBridge, ipcRenderer } from 'electron';

// The only surface available to the renderer. No Node APIs, no secrets,
// no arbitrary IPC channels.
contextBridge.exposeInMainWorld('holobox', {
  api: (path: string, options: Record<string, unknown> = {}) =>
    ipcRenderer.invoke('api:request', { path, ...options }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),
  openConfigFile: () => ipcRenderer.invoke('config:open'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
});
