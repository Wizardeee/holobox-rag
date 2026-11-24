import type { DocumentStatus } from '../types/api';

const LABELS: Record<DocumentStatus, string> = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

export function StatusPill({ status }: { status: DocumentStatus }) {
  return <span className={`pill pill-${status}`}>{LABELS[status]}</span>;
}
