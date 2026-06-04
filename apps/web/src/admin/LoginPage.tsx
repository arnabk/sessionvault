import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, applyBranding } from '../api';

export function LoginPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.login(username, password);
      // pick up branding now that we're authenticated
      try {
        const d = await api.getBranding();
        applyBranding(d.branding);
      } catch { /* ignore */ }
      nav('/admin/sessions');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card fade-in" onSubmit={submit}>
        <div className="auth-brand"><span className="auth-mark" />SessionVault</div>
        <h2 style={{ marginBottom: 4 }}>Sign in</h2>
        <p className="muted" style={{ marginTop: 0 }}>Access your workspace.</p>

        {err && <div className="banner err" data-testid="login-error">{err}</div>}

        <div className="field">
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            data-testid="login-username"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="login-password"
          />
        </div>
        <button className="primary lg" type="submit" disabled={busy} data-testid="login-submit" style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>
    </div>
  );
}
