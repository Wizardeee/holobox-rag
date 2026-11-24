import type {
  ApiError,
  ApiResult,
  CapabilitiesResponse,
  Conversation,
  CourseCreate,
  CourseInfo,
  DeletedResponse,
  DocumentInfo,
  DocumentUpdate,
  FilePart,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  PrincipalInfo,
  QueryRequest,
  QueryResponse,
  Scope,
  SubjectCreate,
  SubjectInfo,
  SynthesisRequest,
  TranscriptionResponse,
} from '../types/api';
import { httpRequest } from './transport';

async function request<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
  const result: ApiResult<T> = await httpRequest<T>(path, options);
  if (!result.ok) {
    const detail = (result.data as unknown as ApiError)?.detail;
    throw new Error(detail?.message ?? `Request failed with status ${result.status}`);
  }
  return result.data;
}

async function filePart(file: File): Promise<FilePart> {
  return { fileName: file.name, type: file.type, data: Array.from(new Uint8Array(await file.arrayBuffer())) };
}

export const api = {
  health: () => request<HealthResponse>('/api/v1/health'),
  capabilities: () => request<CapabilitiesResponse>('/api/v1/config/capabilities'),

  login: (body: LoginRequest) => request<LoginResponse>('/api/v1/auth/login', { method: 'POST', body }),
  me: () => request<PrincipalInfo>('/api/v1/auth/me'),

  listCourses: () => request<CourseInfo[]>('/api/v1/courses'),
  createCourse: (body: CourseCreate) =>
    request<CourseInfo>('/api/v1/courses', { method: 'POST', body }),
  listSubjects: (courseId: string) =>
    request<SubjectInfo[]>(`/api/v1/courses/${encodeURIComponent(courseId)}/subjects`),
  createSubject: (courseId: string, body: SubjectCreate) =>
    request<SubjectInfo>(`/api/v1/courses/${encodeURIComponent(courseId)}/subjects`, { method: 'POST', body }),

  listDocuments: (params: { course_id?: string; subject_id?: string } = {}) =>
    request<DocumentInfo[]>('/api/v1/documents', { query: params }),
  uploadDocument: async (
    file: File,
    courseId: string,
    subjectId: string | undefined,
    scope: Scope = 'user',
    approved = true,
  ) =>
    request<DocumentInfo>('/api/v1/documents', {
      method: 'POST',
      form: { file: await filePart(file), course_id: courseId, subject_id: subjectId, scope, approved: String(approved) },
    }),
  updateDocument: (id: string, body: DocumentUpdate) =>
    request<DocumentInfo>(`/api/v1/documents/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  reindexDocument: (id: string) =>
    request<DocumentInfo>(`/api/v1/documents/${encodeURIComponent(id)}/reindex`, { method: 'POST' }),
  replaceDocument: async (id: string, file: File) =>
    request<DocumentInfo>(`/api/v1/documents/${encodeURIComponent(id)}/replace`, {
      method: 'POST',
      form: { file: await filePart(file) },
    }),
  deleteDocument: (id: string) =>
    request<DeletedResponse>(`/api/v1/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  query: (body: QueryRequest) => request<QueryResponse>('/api/v1/query', { method: 'POST', body }),
  transcribe: (audio: FilePart, language?: string) =>
    request<TranscriptionResponse>('/api/v1/transcribe', {
      method: 'POST',
      form: { audio, language: language || undefined },
    }),
  synthesize: (body: SynthesisRequest) => request<number[]>('/api/v1/synthesize', { method: 'POST', body }),

  listConversations: () => request<Conversation[]>('/api/v1/conversations'),
  getConversation: (id: string) => request<Conversation>(`/api/v1/conversations/${encodeURIComponent(id)}`),
  createConversation: (body: { owner_id: string; title?: string }) =>
    request<Conversation>('/api/v1/conversations', { method: 'POST', body }),
  deleteConversation: (id: string) =>
    request<DeletedResponse>(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
