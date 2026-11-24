import type { SourceReference } from '../types/api';

export function SourceList({ sources }: { sources: SourceReference[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="sources">
      <div className="sources-title">Sources</div>
      {sources.map((source, index) => (
        <details key={`${source.document_id}-${index}`} className="source">
          <summary>
            <span className="source-index">[{index + 1}]</span>
            <span className="source-name">{source.document_name}</span>
            {source.page_number !== null && source.page_number !== undefined && (
              <span className="source-page">page {source.page_number}</span>
            )}
            <span className="source-score">{Math.round(source.score * 100)}%</span>
          </summary>
          <p>{source.excerpt}</p>
        </details>
      ))}
    </div>
  );
}
