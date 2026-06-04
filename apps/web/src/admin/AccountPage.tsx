import { useState } from 'react';
import { api } from '../api';

export function AccountPage() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  async function submit() {
    setErr(''); setOk(false);
    if (next.length < 6) return setErr('New password must be at least 6 characters.');
    if (next !== confirm) return setErr('New passwords do not match.');
    try {
      await api.changePassword(cur, next);
      setOk(true);
      setCur(''); setNext(''); setConfirm('');
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2 style={{ marginBottom: 4 }}>Account</h2>
          <span className="faint">Change your password.</span>
        </div>
      </div>

      {err && <div className="banner err" data-testid="pw-error">{err}</div>}
      {ok && <div className="banner ok" data-testid="pw-ok">Password updated.</div>}

      <div className="card" style={{ maxWidth: 440 }}>
        <div className="field">
          <label>Current password</label>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="cur-pw" />
        </div>
        <div className="field">
          <label>New password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="new-pw" />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="confirm-pw" />
        </div>
        <button className="primary" onClick={submit} data-testid="change-pw">Update password</button>
      </div>
    </div>
  );
}
