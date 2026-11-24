import { useState } from 'react';
import { api, errorMessage } from '../services/api';
import { setBrowserToken } from '../services/transport';

export function LoginPage({ onLogin }: { onLogin: (displayName: string) => void }) {
  const [username, setUsername] = useState('teacher');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login({ username, password });
      if (result.role !== 'teacher') throw new Error('Unexpected role returned');
      setBrowserToken(result.access_token);
      onLogin(result.display_name);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">H</div>
        <h1>Teacher Portal</h1>
        <p>Sign in to manage course knowledge bases.</p>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div className="teacher-error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
