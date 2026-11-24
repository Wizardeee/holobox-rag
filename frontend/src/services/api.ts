import type {
  ApiError,
  ApiResult,
  CapabilitiesResponse,
  Conversation,
  ConversationSummary,
  DeletedResponse,
  DocumentInfo,
  FilePart,
  HealthResponse,
  QueryRequest,
  QueryResponse,
  Scope,
  SourceReference,
  SynthesisRequest,
  TranscriptionResponse,
} from '../types/api';

async function request<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
  const result: ApiResult<T> = await window.holobox.api<T>(path, options);
  if (!result.ok) {
    const detail = (result.data as unknown as ApiError)?.detail;
    throw new Error(detail?.message ?? `Request failed with status ${result.status}`);
  }
  return result.data;
}

export const api = {
  health: () => request<HealthResponse>('/api/v1/health'),
  capabilities: () => request<CapabilitiesResponse>('/api/v1/config/capabilities'),

  listDocuments: () => request<DocumentInfo[]>('/api/v1/documents'),
  uploadDocument: async (file: File, scope: Scope) =>
    request<DocumentInfo>('/api/v1/documents', {
      method: 'POST',
      form: {
        file: { fileName: file.name, type: file.type, data: Array.from(new Uint8Array(await file.arrayBuffer())) },
        scope,
      },
    }),
  deleteDocument: (id: string) =>
    request<DeletedResponse>(`/api/v1/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  query: (body: QueryRequest) => request<QueryResponse>('/api/v1/query', { method: 'POST', body }),

  transcribe: (audio: FilePart, language?: string) =>
    request<TranscriptionResponse>('/api/v1/transcribe', {
      method: 'POST',
      form: { audio, language: language || undefined },
    }),

  synthesize: (body: SynthesisRequest) =>
    request<number[]>('/api/v1/synthesize', { method: 'POST', body }),

  listConversations: () => request<ConversationSummary[]>('/api/v1/conversations'),
  getConversation: (id: string) => request<Conversation>(`/api/v1/conversations/${encodeURIComponent(id)}`),
  createConversation: (body: { owner_id: string; title?: string }) =>
    request<Conversation>('/api/v1/conversations', { method: 'POST', body }),
  deleteConversation: (id: string) =>
    request<DeletedResponse>(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};


export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
