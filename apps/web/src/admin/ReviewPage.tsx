import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

export function ReviewPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [noteAt, setNoteAt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function reload() {
    if (!id) return;
    const d = await api.getSession(id);
    setData(d);
  }
  useEffect(() => {
    reload().catch((e) => setErr(e.message));
  }, [id]);

  async function forceEnd() {
    if (!id) return;
    await api.forceEnd(id);
    await reload();
  }
  async function addNote() {
    if (!id || !note.trim()) return;
    await api.addAnnotation(id, { at_ms: noteAt, body: note });
    setNote('');
    await reload();
  }

  if (err) return <div className="banner err">{err}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const s = data.session;
  const events: any[] = data.events;
  const annotations: any[] = data.annotations;
  const durationMs = Math.max(
    ...events.map((e) => e.at_ms),
    ...annotations.map((a) => a.at_ms),
    60000,
  );

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>
          Review — {s.participant_name || 'Participant'}{' '}
          <span className={`tag ${s.status === 'complete' ? 'green' : s.status === 'force_ended' ? 'danger' : ''}`}>{s.status}</span>
        </h2>
        <div className="row">
          {['issued', 'recording', 'started'].includes(s.status) && (
            <button className="danger" onClick={forceEnd} data-testid="force-end">Force end</button>
          )}
          <Link to="/admin/sessions">Back</Link>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="card">
            <div className="player-wrap">
              {/* Placeholder player surface. Real playback wires presigned segment URLs (SPEC §7). */}
              <video ref={videoRef} className="main" controls poster="" data-testid="player">
                <source src="" />
              </video>
            </div>
            <div className="timeline" data-testid="timeline">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="marker"
                  title={`${e.type} @ ${e.at_ms}ms`}
                  style={{ left: `${(e.at_ms / durationMs) * 100}%` }}
                />
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              End reason: {s.end_reason || '—'} · Artifacts: {data.artifacts.length}
            </p>
          </div>

          <div className="card">
            <h3>Annotations</h3>
            <div className="row" style={{ marginBottom: 10 }}>
              <input type="number" style={{ width: 120 }} value={noteAt} onChange={(e) => setNoteAt(parseInt(e.target.value || '0', 10))} title="at ms" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" data-testid="note-input" />
              <button className="primary" onClick={addNote} data-testid="note-add">Add</button>
            </div>
            <ul className="steplist">
              {annotations.length === 0 && <li className="muted">No annotations.</li>}
              {annotations.map((a) => (
                <li key={a.id} data-testid="annotation-item">
                  <span><span className="tag">{a.at_ms}ms</span> {a.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card">
          <h3>Event timeline</h3>
          <ul className="steplist">
            {events.length === 0 && <li className="muted">No events recorded.</li>}
            {events.map((e) => (
              <li key={e.id} data-testid="event-item">
                <span><span className="tag">{e.at_ms}ms</span> {e.type}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
