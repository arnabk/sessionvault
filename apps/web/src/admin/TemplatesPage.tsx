import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.listTemplates().then((d) => setTemplates(d.templates)).catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Templates</h2>
          <span className="faint">Author reusable session flows with the Session Builder.</span>
        </div>
        <Link to="/admin/templates/new">
          <button className="primary">+ New template</button>
        </Link>
      </div>
      {err && <div className="banner err">{err}</div>}
      <div className="card flush">
        {templates.length === 0 ? (
          <div className="empty" data-testid="templates-empty">
            <div className="em-icon">✚</div>
            <h3>No templates yet</h3>
            <p className="muted">Create your first session flow with the Session Builder.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Steps</th>
                <th>Timer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} data-testid="template-row">
                  <td>{t.name}</td>
                  <td>{t.step_count}</td>
                  <td>{Math.round((t.flow_config?.totalTimerSeconds ?? 0) / 60)} min</td>
                  <td>
                    <Link to={`/admin/templates/${t.id}`}>Edit</Link>
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
