import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { RichText } from '../ui/RichText';

// Simplified model: every step is a task (content page). Capture requirements
// and the consent notice are configured once at the flow level.
interface Step {
  title: string;
  body_md: string;
}

interface Capture {
  camera: boolean;
  screen: boolean;
  fullDesktop: boolean;
  mic: boolean;
}

const DEFAULT_STEPS: Step[] = [
  { title: 'Your task', body_md: '<p>Describe the task here.</p>' },
];

const DEFAULT_CONSENT = 'This session records your screen and camera. By continuing you agree to be recorded for review.';

// Convert an old typed-step template into the task-only model.
function migrateSteps(rawSteps: any[]): { steps: Step[]; capture: Capture; consent: string } {
  let capture: Capture = { camera: false, screen: false, fullDesktop: false, mic: false };
  let consent = '';
  const steps: Step[] = [];
  for (const s of rawSteps) {
    const type = s.type ?? 'task';
    if (type === 'preflight') {
      capture = {
        camera: !!s.config?.camera,
        screen: !!s.config?.screen,
        fullDesktop: !!s.config?.fullDesktop,
        mic: !!s.config?.mic,
      };
      continue;
    }
    if (type === 'consent') {
      consent = s.body_md || DEFAULT_CONSENT;
      continue;
    }
    if (type === 'finish' || type === 'welcome') {
      // welcome/finish are now automatic; drop them as standalone steps.
      continue;
    }
    steps.push({ title: s.title || 'Task', body_md: s.body_md || '' });
  }
  if (steps.length === 0) steps.push(...DEFAULT_STEPS);
  // If nothing captured was set on an old flow, default to camera+screen.
  if (!capture.camera && !capture.screen && !capture.mic) {
    capture = { camera: true, screen: true, fullDesktop: true, mic: false };
  }
  return { steps, capture, consent: consent || DEFAULT_CONSENT };
}

export function BuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [name, setName] = useState('Untitled session');
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);
  const [active, setActive] = useState(0);
  const [timerMin, setTimerMin] = useState(30);
  const [consent, setConsent] = useState(DEFAULT_CONSENT);
  const [capture, setCapture] = useState<Capture>({ camera: true, screen: true, fullDesktop: true, mic: false });
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(id ?? null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getTemplate(id).then((d) => {
      setName(d.template.name);
      setTimerMin(Math.round((d.template.flow_config?.totalTimerSeconds ?? 1800) / 60));
      const fc = d.template.flow_config ?? {};
      // Prefer the new flow-level fields; otherwise migrate old typed steps.
      if (fc.capture || fc.consentText !== undefined) {
        setCapture({
          camera: !!fc.capture?.camera,
          screen: !!fc.capture?.screen,
          fullDesktop: !!fc.capture?.fullDesktop,
          mic: !!fc.capture?.mic,
        });
        setConsent(fc.consentText ?? DEFAULT_CONSENT);
        setSteps(d.steps.map((s: any) => ({ title: s.title, body_md: s.body_md })));
      } else {
        const m = migrateSteps(d.steps);
        setCapture(m.capture);
        setConsent(m.consent);
        setSteps(m.steps);
      }
      setSavedId(id);
    }).catch((e) => setErr(e.message));
  }, [id]);

  function patchStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { title: `Task ${prev.length + 1}`, body_md: '' }]);
    setActive(steps.length);
  }
  function removeStep(i: number) {
    if (steps.length === 1) return; // keep at least one step
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
    setActive(0);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const c = [...prev];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setActive(j);
  }
  function toggleCapture(k: keyof Capture, v: boolean) {
    setCapture((c) => {
      const next = { ...c, [k]: v };
      if (k === 'screen' && !v) next.fullDesktop = false;
      if (k === 'fullDesktop' && v) next.screen = true;
      return next;
    });
  }

  function payload() {
    // Persist as task-only steps; capture + consent live on flow_config. We also
    // emit a synthetic preflight/consent-free snapshot for the backend.
    return {
      name,
      flow_config: {
        capture,
        consentText: consent,
        timerMode: 'total',
        totalTimerSeconds: timerMin * 60,
        recordingStart: 'after_preflight',
        timerStart: 'on_recording_start',
        navigation: 'linear',
        endTriggers: ['submit', 'timeout', 'permission_loss', 'force_end'],
      },
      steps: steps.map((s) => ({ type: 'task', title: s.title, body_md: s.body_md, required: true, config: {} })),
    };
  }

  async function save(done = false) {
    setErr('');
    try {
      let tid = savedId;
      if (savedId) {
        await api.updateTemplate(savedId, payload());
      } else {
        const d = await api.createTemplate(payload());
        tid = d.template.id;
        setSavedId(tid);
      }
      if (done) {
        nav('/admin/templates');
      } else {
        if (!savedId && tid) nav(`/admin/templates/${tid}`, { replace: true });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1800);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const s = steps[active];

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Session Builder</h2>
          <span className="faint">Author the participant flow, then create sessions from it.</span>
        </div>
        <div className="row">
          {savedFlash && <span className="tag green">Saved</span>}
          <button onClick={() => save(false)} data-testid="save-template">Save</button>
          <button className="primary" onClick={() => save(true)} data-testid="publish-template">Save &amp; close</button>
        </div>
      </div>
      {err && <div className="banner err" data-testid="builder-error">{err}</div>}

      <div className="card">
        <div className="field">
          <label>Session name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="template-name" />
        </div>
        <div className="row wrap">
          <div className="field" style={{ width: 200 }}>
            <label>Total timer (minutes)</label>
            <input
              type="number"
              value={timerMin}
              onChange={(e) => setTimerMin(parseInt(e.target.value || '0', 10))}
              data-testid="timer-min"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 280 }}>
            <label>Required permissions (checked before the session starts)</label>
            <div className="row wrap" style={{ gap: 14 }}>
              {([
                ['camera', 'Camera'],
                ['screen', 'Screen share'],
                ['fullDesktop', 'Full desktop only'],
                ['mic', 'Microphone'],
              ] as [keyof Capture, string][]).map(([k, label]) => (
                <label key={k} className="row" style={{ gap: 7 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={capture[k]}
                    onChange={(e) => toggleCapture(k, e.target.checked)}
                    data-testid={`capture-${k}`}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Consent notice (shown before the session starts)</label>
          <textarea
            value={consent}
            onChange={(e) => setConsent(e.target.value)}
            data-testid="consent-text"
            style={{ minHeight: 60 }}
          />
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>Tasks ({steps.length})</strong>
            <button onClick={addStep} data-testid="add-step">+ Add task</button>
          </div>
          <ul className="steplist">
            {steps.map((st, i) => (
              <li key={i} className={i === active ? 'active' : ''} onClick={() => setActive(i)} data-testid="step-item">
                <span>
                  <span className="step-title">{st.title || 'Untitled task'}</span>
                </span>
                <span className="step-actions">
                  <button className="sm" title="Move up" onClick={(e) => { e.stopPropagation(); move(i, -1); }}>↑</button>
                  <button className="sm" title="Move down" onClick={(e) => { e.stopPropagation(); move(i, 1); }}>↓</button>
                  <button className="sm x" title="Remove" disabled={steps.length === 1} onClick={(e) => { e.stopPropagation(); removeStep(i); }}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          {s ? (
            <>
              <div className="field">
                <label>Task title</label>
                <input value={s.title} onChange={(e) => patchStep(active, { title: e.target.value })} data-testid="step-title" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Instructions</label>
                <RichText
                  value={s.body_md}
                  onChange={(html) => patchStep(active, { body_md: html })}
                  placeholder="Write the instructions for this task…"
                  testId="step-body"
                />
              </div>
            </>
          ) : (
            <p className="muted">Add a task to begin.</p>
          )}
        </div>
      </div>
    </div>
  );
}
