import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Select } from '../ui/Select';

function statusTag(s: string) {
  const cls =
    s === 'complete' ? 'green' : s === 'issued' ? '' : s === 'recording' ? 'warn' : s === 'force_ended' || s === 'incomplete' ? 'danger' : '';
  return <span className={`tag ${cls}`}>{s}</span>;
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const [issued, setIssued] = useState<{ link: string } | null>(null);

  // issue form
  const [templateId, setTemplateId] = useState('');
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [ttl, setTtl] = useState(7);
  const [consumeOn, setConsumeOn] = useState('complete');

  async function reload() {
    const [s, t] = await Promise.all([api.listSessions(), api.listTemplates()]);
    setSessions(s.sessions);
    setTemplates(t.templates);
    if (t.templates[0] && !templateId) setTemplateId(t.templates[0].id);
  }

  useEffect(() => {
    reload().catch((e) => setErr(e.message));
  }, []);

  async function issue() {
    setErr('');
    try {
      const d = await api.issueSession({
        template_id: templateId,
        participant_name: pName,
        participant_email: pEmail,
        link_ttl_days: ttl,
        consume_on: consumeOn,
      });
      setIssued({ link: d.link });
      await reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Sessions</h2>
          <span className="faint">Create participant links and review completed recordings.</span>
        </div>
        <button className="primary" onClick={() => { setShowIssue(true); setIssued(null); }} data-testid="new-session">
          + Create session
        </button>
      </div>
      {err && <div className="banner err">{err}</div>}

      {showIssue && (
        <div className="card" data-testid="issue-panel">
          <h3>Create a session</h3>
          {templates.length === 0 ? (
            <p className="muted">
              No templates yet. <Link to="/admin/templates/new">Create one</Link> first.
            </p>
          ) : (
            <>
              <div className="row wrap">
                <div className="field" style={{ width: 280 }}>
                  <label>Template</label>
                  <Select
                    testId="issue-template"
                    value={templateId}
                    onChange={setTemplateId}
                    options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  />
                </div>
                <div className="field" style={{ width: 220 }}>
                  <label>Participant name</label>
                  <input value={pName} onChange={(e) => setPName(e.target.value)} data-testid="issue-name" />
                </div>
                <div className="field" style={{ width: 240 }}>
                  <label>Participant email</label>
                  <input value={pEmail} onChange={(e) => setPEmail(e.target.value)} data-testid="issue-email" />
                </div>
                <div className="field" style={{ width: 150 }}>
                  <label>Link TTL (days)</label>
                  <input type="number" value={ttl} onChange={(e) => setTtl(parseInt(e.target.value || '7', 10))} data-testid="issue-ttl" />
                </div>
                <div className="field" style={{ width: 210 }}>
                  <label>Consume link</label>
                  <Select
                    testId="issue-consume"
                    value={consumeOn}
                    onChange={setConsumeOn}
                    options={[
                      { value: 'complete', label: 'On completion', hint: 'reusable until finished' },
                      { value: 'start', label: 'On start', hint: 'one attempt only' },
                    ]}
                  />
                </div>
              </div>
              <div className="row">
                <button className="primary" onClick={issue} data-testid="issue-submit">Generate link</button>
                <button onClick={() => setShowIssue(false)}>Close</button>
              </div>
            </>
          )}
          {issued && (
            <div className="banner ok" style={{ marginTop: 12 }} data-testid="issued-link">
              Link: <a href={issued.link} target="_blank" rel="noreferrer">{issued.link}</a>
            </div>
          )}
        </div>
      )}

      <div className="card flush">
        {sessions.length === 0 ? (
          <div className="empty" data-testid="sessions-empty">
            <div className="em-icon">▶</div>
            <h3>No sessions yet</h3>
            <p className="muted">Create a session to generate a participant link.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Template</th>
                <th>Status</th>
                <th>Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} data-testid="session-row">
                  <td>
                    {s.participant_name || <span className="muted">—</span>}
                    <div className="muted" style={{ fontSize: 12 }}>{s.participant_email}</div>
                  </td>
                  <td>{s.template_name}</td>
                  <td>{statusTag(s.status)}</td>
                  <td>
                    {s.token ? (
                      <a href={`/take/${s.token}`} target="_blank" rel="noreferrer" data-testid="open-take">Open</a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Link to={`/admin/sessions/${s.id}`}>Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
