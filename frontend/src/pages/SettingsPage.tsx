import { useEffect, useState } from 'react';
import { api, errorMessage } from '../services/api';
import type { AppSettings, CapabilitiesResponse } from '../types/api';

interface Props {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
}

export function SettingsPage({ settings, update }: Props) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);

  useEffect(() => setForm(settings), [settings]);
  useEffect(() => {
    api.capabilities().then(setCapabilities).catch((reason) => setError(errorMessage(reason)));
  }, [settings.backendUrl]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setError(null);
    try {
      await update(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const testConnection = async () => {
    setError(null);
    try {
      const health = await api.health();
      setCapabilities(await api.capabilities());
      alert(`Backend ${health.version} is reachable.`);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Connection, identity and voice preferences. Credentials are never stored here.</p>
        </div>
      </header>

      <div className="settings-grid">
        <label>
          Backend URL
          <input value={form.backendUrl} onChange={(event) => set('backendUrl', event.target.value)} />
        </label>
        <label>
          API token (optional)
          <input type="password" value={form.apiToken} onChange={(event) => set('apiToken', event.target.value)} />
        </label>
        <label>
          User ID
          <input value={form.userId} onChange={(event) => set('userId', event.target.value)} />
        </label>
        <label>
          Speech language
          <input
            placeholder="auto / en / hi"
            value={form.language}
            onChange={(event) => set('language', event.target.value)}
          />
        </label>
        <label>
          Whisper model
          <select value={form.sttModel} onChange={(event) => set('sttModel', event.target.value)}>
            {['tiny', 'base', 'small', 'medium'].map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label>
          Piper voice
          <input
            placeholder="leave blank for default"
            value={form.ttsVoice}
            onChange={(event) => set('ttsVoice', event.target.value)}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.voiceInputEnabled}
            onChange={(event) => set('voiceInputEnabled', event.target.checked)}
          />
          Enable microphone input
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.voiceOutputEnabled}
            onChange={(event) => set('voiceOutputEnabled', event.target.checked)}
          />
          Enable spoken responses
        </label>
      </div>

      <div className="settings-actions">
        <button className="primary" onClick={() => void save()}>
          Save settings
        </button>
        <button className="secondary" onClick={() => void testConnection()}>
          Test backend connection
        </button>
        {saved && <span className="saved">Saved</span>}
      </div>
      {error && <div className="banner banner-error">{error}</div>}

      {capabilities && (
        <div className="capabilities">
          <h2>Backend capabilities</h2>
          <p>Active LLM provider: <strong>{capabilities.active_provider}</strong>{capabilities.llm_configured ? '' : ' (not configured)'}</p>
          <p>Embedding model: {capabilities.embedding_model}</p>
          <p>Available providers: {capabilities.providers.join(', ')}</p>
          <p>Piper voices: {capabilities.tts_voices.join(', ') || 'none discovered'}</p>
        </div>
      )}
    </section>
  );
}
