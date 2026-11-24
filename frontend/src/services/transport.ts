/** One HTTP transport, two hosts: Electron preload bridge or browser fetch. */

import type { ApiOptions, ApiResult } from '../types/api';

const TOKEN_KEY = 'holobox_teacher_token';

export function setBrowserToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getBrowserToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export async function httpRequest<T>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const bridge = (window as unknown as { holobox?: { api<T>(p: string, o: ApiOptions): Promise<ApiResult<T>> } }).holobox;
  if (bridge?.api) return bridge.api<T>(path, options);

  // Browser (teacher portal). Vite proxies /api to the backend on the LAN host.
  const configured = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  const url = `${configured}${path}${suffix ? `?${suffix}` : ''}`;
  const headers: Record<string, string> = {};
  const token = getBrowserToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options.form)) {
      if (value === undefined) continue;
      if (typeof value === 'object' && Array.isArray(value.data)) {
        form.append(key, new Blob([new Uint8Array(value.data)], { type: value.type ?? 'application/octet-stream' }), value.fileName);
      } else {
        form.append(key, String(value));
      }
    }
    body = form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, { method: options.method ?? 'GET', headers, body });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('audio')
      ? Array.from(new Uint8Array(await response.arrayBuffer()))
      : await response.json().catch(() => ({ detail: { code: 'invalid_response', message: 'Invalid JSON' } }));
    return { ok: response.ok, status: response.status, data: data as T };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { detail: { code: 'network_error', message: `Cannot reach backend: ${String(error)}` } } as T,
    };
  }
}
