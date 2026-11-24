import { useCallback, useEffect, useState } from 'react';
import type { useChat } from '../hooks/useChat';
import { api, errorMessage, type ConversationSummary } from '../services/api';

export function HistoryPage({ chat }: { chat: ReturnType<typeof useChat> }) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listConversations().then(setItems).catch((reason) => setError(errorMessage(reason)));
  }, []);
  useEffect(refresh, [refresh, chat.conversationId]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Conversation History</h1>
          <p>Conversations are stored locally by the backend.</p>
        </div>
        <button className="secondary" onClick={chat.reset}>
          Start new conversation
        </button>
      </header>
      {error && <div className="banner banner-error">{error}</div>}
      <div className="document-list">
        {items.length === 0 && <p className="empty-row">No saved conversations yet.</p>}
        {items.map((item) => (
          <article key={item.id} className="document-card">
            <div className="document-main">
              <strong>{item.title || 'Untitled conversation'}</strong>
              <span className="muted">
                {item.message_count} messages · {new Date(item.updated_at).toLocaleString()}
              </span>
            </div>
            <div className="document-meta">
              <button
                className="secondary"
                onClick={() => {
                  void chat.load(item.id);
                }}
              >
                Open
              </button>
              <button
                className="danger"
                onClick={() => {
                  void api.deleteConversation(item.id).then(refresh).catch((reason) => setError(errorMessage(reason)));
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
