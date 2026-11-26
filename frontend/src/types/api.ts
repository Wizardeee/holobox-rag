import type { components } from './api.generated';

export type DocumentInfo = components['schemas']['DocumentInfo'];
export type DocumentStatus = components['schemas']['DocumentStatus'];
export type Scope = components['schemas']['Scope'];
export type SourceReference = components['schemas']['SourceReference'];
export type QueryRequest = components['schemas']['QueryRequest'];
export type QueryResponse = components['schemas']['QueryResponse'];
export type AnswerSource = components['schemas']['AnswerSource'];
export type DocumentSupport = components['schemas']['DocumentSupport'];
export type TranscriptionResponse = components['schemas']['TranscriptionResponse'];
export type SynthesisRequest = components['schemas']['SynthesisRequest'];
export type Conversation = components['schemas']['Conversation'];
export type ConversationSummary = components['schemas']['ConversationSummary'];
export type MessageInfo = components['schemas']['MessageInfo'];
export type CapabilitiesResponse = components['schemas']['CapabilitiesResponse'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type DeletedResponse = components['schemas']['DeletedResponse'];
export type CourseInfo = components['schemas']['CourseInfo'];
export type SubjectInfo = components['schemas']['SubjectInfo'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type PrincipalInfo = components['schemas']['PrincipalInfo'];
export type DocumentUpdate = components['schemas']['DocumentUpdate'];
export type CourseCreate = components['schemas']['CourseCreate'];
export type SubjectCreate = components['schemas']['SubjectCreate'];

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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: Record<string, string | FilePart | undefined>;
}

/** Settings safe to expose to the renderer. Never contains tokens or backend URL. */
export interface AppSettings {
  backendUrlConfigured: boolean;
  configPath: string;
  courseId: string;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  sttModel: string;
  ttsVoice: string;
  language: string;
  personDetectionEnabled: boolean;
  personDetectionConfidence: number;
  personDetectionIntervalMs: number;
  personPresenceMs: number;
  personAbsenceMs: number;
  greetingText: string;
}
