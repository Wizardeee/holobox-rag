import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../services/api';
import type { CourseInfo, DocumentInfo, SubjectInfo } from '../types/api';

interface Props {
  course: CourseInfo;
  subjects: SubjectInfo[];
}

export function DocumentManager({ course, subjects }: Props) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [approved, setApproved] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const replaceInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(() => {
    api.listDocuments({ course_id: course.id })
      .then(setDocuments)
      .catch((reason) => setError(errorMessage(reason)));
  }, [course.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (reason) {
      setError(`${message}: ${errorMessage(reason)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="teacher-panel">
      <h2>{course.name}</h2>

      <div className="teacher-card">
        <h3>Upload course document</h3>
        <div className="teacher-row">
          <input type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
          <label className="inline-check">
            <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
            Available to students
          </label>
          <button
            className="primary"
            disabled={!file || busy}
            onClick={() =>
              file &&
              run(
                () => api.uploadDocument(file, course.id, subjectId || undefined, 'user', approved),
                'Upload failed',
              ).then(() => setFile(null))
            }
          >
            Upload
          </button>
        </div>
        <p className="teacher-hint">PDF, DOCX, TXT and Markdown. Files are stored locally on the backend machine.</p>
      </div>

      <div className="teacher-card">
        <h3>Add subject</h3>
        <div className="teacher-row">
          <input placeholder="Subject name" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} />
          <button
            className="secondary"
            disabled={!subjectName.trim() || busy}
            onClick={() =>
              run(
                () =>
                  api.createSubject(course.id, {
                    id: subjectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                    name: subjectName.trim(),
                  }),
                'Could not add subject',
              ).then(() => setSubjectName(''))
            }
          >
            Add subject
          </button>
        </div>
      </div>

      {error && <div className="teacher-error">{error}</div>}
      {busy && <p className="teacher-hint">Working…</p>}

      <div className="teacher-card">
        <h3>Documents ({documents.length})</h3>
        {documents.length === 0 && <p className="teacher-hint">No documents in this course yet.</p>}
        {documents.map((document) => (
          <article key={document.id} className="document-row">
            <div className="document-info">
              <strong>{document.name}</strong>
              <span>
                {document.subject_id ?? 'No subject'} · {document.uploader} ·{' '}
                {new Date(document.created_at).toLocaleString()} · {document.chunk_count} chunks
                {document.page_count ? ` · ${document.page_count} pages` : ''}
              </span>
              {document.error && <span className="teacher-error-inline">{document.error}</span>}
            </div>
            <div className="document-actions">
              <span className={`status status-${document.status}`}>{document.status}</span>
              <span className={`status ${document.approved ? 'status-ready' : 'status-failed'}`}>
                {document.approved ? 'approved' : 'hidden'}
              </span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(() => api.updateDocument(document.id, { approved: !document.approved }), 'Update failed')}
              >
                {document.approved ? 'Hide' : 'Approve'}
              </button>
              <button className="secondary" disabled={busy} onClick={() => run(() => api.reindexDocument(document.id), 'Re-index failed')}>
                Re-index
              </button>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                ref={(element) => { replaceInputs.current[document.id] = element; }}
                style={{ display: 'none' }}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) run(() => api.replaceDocument(document.id, next), 'Replace failed');
                }}
              />
              <button className="secondary" disabled={busy} onClick={() => replaceInputs.current[document.id]?.click()}>
                Replace
              </button>
              <button className="danger" disabled={busy} onClick={() => run(() => api.deleteDocument(document.id), 'Delete failed')}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
