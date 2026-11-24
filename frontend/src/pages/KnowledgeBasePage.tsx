import { useEffect, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { Spinner } from '../components/Spinner';
import { api, errorMessage } from '../services/api';
import type { DocumentInfo, Scope } from '../types/api';

export function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<Scope>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.listDocuments().then(setDocuments).catch((reason) => setError(errorMessage(reason)));
  useEffect(() => {
    void refresh();
  }, []);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadDocument(file, scope);
      setFile(null);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteDocument(id);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Knowledge Base</h1>
          <p>PDF, DOCX, TXT and Markdown documents. Everything stays on this machine.</p>
        </div>
      </header>

      <div className="upload-card">
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <select value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
          <option value="user">My documents</option>
          <option value="shared">Shared knowledge base</option>
        </select>
        <button className="primary" onClick={() => void upload()} disabled={!file || busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {busy && <Spinner label="Extracting, chunking and indexing…" />}
      {error && <div className="banner banner-error">{error}</div>}

      <div className="document-list">
        {documents.length === 0 && <p className="empty-row">No documents yet.</p>}
        {documents.map((document) => (
          <article key={document.id} className="document-card">
            <div className="document-main">
              <strong>{document.name}</strong>
              <span className="muted">
                {document.scope === 'shared' ? 'Shared' : 'Personal'} · {(document.size_bytes / 1024).toFixed(1)} KB ·{' '}
                {new Date(document.created_at).toLocaleString()}
              </span>
              {document.error && <span className="muted error-text">{document.error}</span>}
            </div>
            <div className="document-meta">
              <StatusPill status={document.status} />
              <span>{document.chunk_count} chunks</span>
              <span>{document.page_count ? `${document.page_count} pages` : 'no page data'}</span>
              <button className="danger" onClick={() => void remove(document.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
