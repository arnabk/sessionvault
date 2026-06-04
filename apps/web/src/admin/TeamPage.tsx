import { useEffect, useState } from 'react';
import { api } from '../api';
import { Select } from '../ui/Select';

export function TeamPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');

  async function reload() {
    const d = await api.listUsers();
    setUsers(d.users);
  }
  useEffect(() => {
    reload().catch((e) => setErr(e.message));
  }, []);

  async function create() {
    setErr('');
    try {
      await api.createUser({ username, password, name, role });
      setUsername(''); setPassword(''); setName(''); setRole('member');
      setShow(false);
      await reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function remove(id: string) {
    setErr('');
    try {
      await api.deleteUser(id);
      await reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2 style={{ marginBottom: 4 }}>Team</h2>
          <span className="faint">Invite teammates with a username and password. Admins manage the team; members can run sessions.</span>
        </div>
        <button className="primary" onClick={() => setShow(true)} data-testid="add-member">+ Add member</button>
      </div>

      {err && <div className="banner err">{err}</div>}

      {show && (
        <div className="card" data-testid="add-member-panel">
          <h3>Add a team member</h3>
          <div className="row wrap">
            <div className="field" style={{ width: 200 }}>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="member-username" />
            </div>
            <div className="field" style={{ width: 200 }}>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="member-password" />
            </div>
            <div className="field" style={{ width: 200 }}>
              <label>Display name (optional)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} data-testid="member-name" />
            </div>
            <div className="field" style={{ width: 180 }}>
              <label>Role</label>
              <Select
                testId="member-role"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'member', label: 'Member', hint: 'can run & review sessions' },
                  { value: 'admin', label: 'Admin', hint: 'full access + team management' },
                ]}
              />
            </div>
          </div>
          <div className="row">
            <button className="primary" onClick={create} data-testid="member-submit">Create member</button>
            <button onClick={() => setShow(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card flush">
        <table>
          <thead>
            <tr><th>Username</th><th>Name</th><th>Role</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-testid="user-row">
                <td>{u.username}</td>
                <td>{u.name || <span className="muted">—</span>}</td>
                <td><span className={`tag ${u.role === 'admin' ? 'green' : ''}`}>{u.role}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="sm" onClick={() => remove(u.id)} data-testid="remove-user">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
