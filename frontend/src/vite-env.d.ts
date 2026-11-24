/// <reference types="vite/client" />

import type { ApiOptions, ApiResult, AppSettings } from './types/api';

declare global {
  interface Window {
    holobox: {
      api<T>(path: string, options?: ApiOptions): Promise<ApiResult<T>>;
      getSettings(): Promise<AppSettings>;
      setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
      getAppInfo(): Promise<{ version: string; platform: string }>;
    };
  }
}

export {};
