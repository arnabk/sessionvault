import { useEffect, useState } from 'react';
import { api, applyBranding, type Branding } from '../api';
import { Select } from '../ui/Select';

const SWATCHES = ['#4f46e5', '#0ea5e9', '#0f9d58', '#e11d48', '#d97706', '#7c3aed', '#111827'];

export function SettingsPage() {
  const [b, setB] = useState<Branding | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getBranding().then((d) => setB(d.branding)).catch((e) => setErr(e.message));
  }, []);

  function patch(p: Partial<Branding>) {
    setB((prev) => {
      const next = { ...(prev as Branding), ...p };
      applyBranding(next); // live preview
      return next;
    });
    setSaved(false);
  }

  async function save() {
    if (!b) return;
    setErr('');
    try {
      const d = await api.updateBranding(b);
      setB(d.branding);
      applyBranding(d.branding);
      setSaved(true);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (!b) return <p className="muted">Loading…</p>;

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2 style={{ marginBottom: 4 }}>Customization</h2>
          <span className="faint">Brand the admin and participant experience. Changes preview live.</span>
        </div>
        <button className="primary" onClick={save} data-testid="save-branding">Save changes</button>
      </div>

      {err && <div className="banner err">{err}</div>}
      {saved && <div className="banner ok" data-testid="branding-saved">Saved. Branding applied across the workspace.</div>}

      <div className="grid2">
        <div className="card">
          <h3>Identity</h3>
          <div className="field">
            <label>Product name</label>
            <input
              value={b.productName}
              onChange={(e) => patch({ productName: e.target.value })}
              data-testid="brand-name"
            />
          </div>
          <div className="field">
            <label>Logo URL (optional)</label>
            <input
              value={b.logoUrl ?? ''}
              placeholder="https://…/logo.svg"
              onChange={(e) => patch({ logoUrl: e.target.value || null })}
              data-testid="brand-logo"
            />
          </div>
          <div className="field">
            <label>Brand color</label>
            <div className="row wrap" style={{ gap: 8 }}>
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className="swatch"
                  style={{ background: c, outline: b.brandColor === c ? '2px solid var(--ink)' : 'none' }}
                  onClick={() => patch({ brandColor: c })}
                  title={c}
                  data-testid={`swatch-${c}`}
                />
              ))}
              <input
                type="color"
                value={b.brandColor}
                onChange={(e) => patch({ brandColor: e.target.value })}
                style={{ width: 44, height: 34, padding: 2 }}
                data-testid="brand-color"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Appearance</h3>
          <div className="field">
            <label>Background</label>
            <Select
              testId="brand-bg"
              value={b.background}
              onChange={(v) => patch({ background: v as Branding['background'] })}
              options={[
                { value: 'grid', label: 'Subtle grid', hint: 'default — light precision grid' },
                { value: 'math', label: 'Mathematical', hint: 'faint formulae & geometry motif' },
                { value: 'plain', label: 'Plain', hint: 'no texture' },
              ]}
            />
          </div>
          <div className="field">
            <label>Participant welcome text</label>
            <textarea
              value={b.welcomeText}
              onChange={(e) => patch({ welcomeText: e.target.value })}
              data-testid="brand-welcome"
            />
          </div>

          <h3 style={{ marginTop: 18 }}>Preview</h3>
          <div className="brand-preview">
            <div className="bp-bar" />
            <div className="bp-brand">
              {b.logoUrl ? <img src={b.logoUrl} alt="" /> : <span className="bp-mark" />}
              <strong>{b.productName}</strong>
            </div>
            <p className="muted" style={{ margin: '10px 0 14px' }}>{b.welcomeText}</p>
            <button className="primary sm">Get started →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
