import { useEffect, useState } from 'react';
import { ChatPage } from './pages/ChatPage';
import { HistoryPage } from './pages/HistoryPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { SettingsPage } from './pages/SettingsPage';
import { useChat } from './hooks/useChat';
import { useSettings } from './hooks/useSettings';
import { api } from './services/api';

type Page = 'chat' | 'knowledge' | 'history' | 'settings';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '◍' },
  { id: 'knowledge', label: 'Knowledge Base', icon: '▤' },
  { id: 'history', label: 'History', icon: '◷' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const { settings, update, error: settingsError } = useSettings();
  const [page, setPage] = useState<Page>('chat');
  const [online, setOnline] = useState<boolean | null>(null);
  const chat = useChat(settings?.userId ?? 'local-user');

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
  }, [settings?.backendUrl]);

  if (!settings) {
    return <div className="boot">Loading Holobox RAG…{settingsError && <p>{settingsError}</p>}</div>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">H</span>
          <div>
            <strong>Holobox RAG</strong>
            <span className="brand-subtitle">Local document assistant</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`status-dot ${online === true ? 'online' : online === false ? 'offline' : ''}`} />
          {online === null ? 'Checking backend…' : online ? 'Backend connected' : 'Backend offline'}
        </div>
      </aside>

      <main className="main">
        {page === 'chat' && <ChatPage settings={settings} chat={chat} />}
        {page === 'knowledge' && <KnowledgeBasePage />}
        {page === 'history' && <HistoryPage chat={chat} />}
        {page === 'settings' && <SettingsPage settings={settings} update={update} />}
      </main>
    </div>
  );
}
