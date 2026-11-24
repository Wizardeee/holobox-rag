import type { components } from './api.generated';

export type DocumentInfo = components['schemas']['DocumentInfo'];
export type DocumentStatus = components['schemas']['DocumentStatus'];
export type Scope = components['schemas']['Scope'];
export type SourceReference = components['schemas']['SourceReference'];
export type QueryRequest = components['schemas']['QueryRequest'];
export type QueryResponse = components['schemas']['QueryResponse'];
export type TranscriptionResponse = components['schemas']['TranscriptionResponse'];
export type CapabilitiesResponse = components['schemas']['CapabilitiesResponse'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type DeletedResponse = components['schemas']['DeletedResponse'];

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export interface ApiError {
  detail: { code: string; message: string };
}

export interface FilePart {
  fileName: string;
  type?: string;
  data: number[];
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: Record<string, string | FilePart | undefined>;
}

export interface AppSettings {
  backendUrl: string;
  apiToken: string;
  userId: string;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  sttModel: string;
  ttsVoice: string;
  language: string;
}
