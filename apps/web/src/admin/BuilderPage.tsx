import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Select } from '../ui/Select';

type StepType = 'welcome' | 'consent' | 'preflight' | 'task' | 'finish';
interface Step {
  type: StepType;
  title: string;
  body_md: string;
  required: boolean;
  config: Record<string, any>;
}

const DEFAULT_STEPS: Step[] = [
  { type: 'consent', title: 'Consent', body_md: 'We will record your screen and camera.', required: true, config: {} },
  { type: 'preflight', title: 'Device checks', body_md: '', required: true, config: { camera: true, screen: true, fullDesktop: true, mic: false } },
  { type: 'task', title: 'Your task', body_md: 'Describe the task here.', required: true, config: {} },
  { type: 'finish', title: 'All done', body_md: 'Thank you for completing the session.', required: true, config: {} },
];

const STEP_TYPES: StepType[] = ['welcome', 'consent', 'preflight', 'task', 'finish'];

export function BuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [name, setName] = useState('Untitled session');
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);
  const [active, setActive] = useState(0);
  const [timerMin, setTimerMin] = useState(30);
  const [recordingStart, setRecordingStart] = useState('after_preflight');
  const [timerStart, setTimerStart] = useState('on_recording_start');
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(id ?? null);


  useEffect(() => {
    if (!id) return;
    api.getTemplate(id).then((d) => {
      setName(d.template.name);
      setTimerMin(Math.round((d.template.flow_config?.totalTimerSeconds ?? 1800) / 60));
      setRecordingStart(d.template.flow_config?.recordingStart ?? 'after_preflight');
      setTimerStart(d.template.flow_config?.timerStart ?? 'on_recording_start');
      setSteps(d.steps.map((s: any) => ({ type: s.type, title: s.title, body_md: s.body_md, required: s.required, config: s.config })));
      setSavedId(id);
    }).catch((e) => setErr(e.message));
  }, [id]);

  function patchStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function patchConfig(i: number, key: string, val: any) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, config: { ...s.config, [key]: val } } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { type: 'task', title: 'New step', body_md: '', required: true, config: {} }]);
    setActive(steps.length);
  }
  function removeStep(i: number) {
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

  function payload() {
    return {
      name,
      flow_config: {
        recordingStart,
        timerStart,
        timerMode: 'total',
        totalTimerSeconds: timerMin * 60,
        navigation: 'linear',
        endTriggers: ['submit', 'timeout', 'permission_loss', 'force_end'],
      },
      steps,
    };
  }

  const [savedFlash, setSavedFlash] = useState(false);

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
          <div className="field" style={{ width: 180 }}>
            <label>Total timer (minutes)</label>
            <input
              type="number"
              value={timerMin}
              onChange={(e) => setTimerMin(parseInt(e.target.value || '0', 10))}
              data-testid="timer-min"
            />
          </div>
          <div className="field" style={{ width: 280 }}>
            <label>Recording starts</label>
            <Select
              testId="recording-start"
              value={recordingStart}
              onChange={setRecordingStart}
              options={[
                { value: 'on_consent_accept', label: 'When consent accepted' },
                { value: 'after_preflight', label: 'After preflight passes' },
                { value: 'on_first_task', label: 'On first task page' },
                { value: 'manual', label: 'Manual (participant starts)' },
              ]}
            />
          </div>
          <div className="field" style={{ width: 280 }}>
            <label>Timer starts</label>
            <Select
              testId="timer-start"
              value={timerStart}
              onChange={setTimerStart}
              options={[
                { value: 'on_recording_start', label: 'When recording starts' },
                { value: 'on_first_task', label: 'On first task page' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>Steps ({steps.length})</strong>
            <button onClick={addStep} data-testid="add-step">+ Add</button>
          </div>
          <ul className="steplist">
            {steps.map((st, i) => (
              <li key={i} className={i === active ? 'active' : ''} onClick={() => setActive(i)} data-testid="step-item">
                <span>
                  <span className="tag">{st.type}</span>
                  <span className="step-title">{st.title}</span>
                </span>
                <span className="step-actions">
                  <button className="sm" title="Move up" onClick={(e) => { e.stopPropagation(); move(i, -1); }}>↑</button>
                  <button className="sm" title="Move down" onClick={(e) => { e.stopPropagation(); move(i, 1); }}>↓</button>
                  <button className="sm x" title="Remove" onClick={(e) => { e.stopPropagation(); removeStep(i); }}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          {s ? (
            <>
              <div className="field">
                <label>Step type</label>
                <Select
                  testId="step-type"
                  value={s.type}
                  onChange={(v) => patchStep(active, { type: v as StepType })}
                  options={STEP_TYPES.map((t) => ({ value: t, label: t }))}
                />
              </div>
              <div className="field">
                <label>Title</label>
                <input value={s.title} onChange={(e) => patchStep(active, { title: e.target.value })} data-testid="step-title" />
              </div>
              <div className="field">
                <label>Body (markdown)</label>
                <textarea value={s.body_md} onChange={(e) => patchStep(active, { body_md: e.target.value })} data-testid="step-body" />
              </div>
              {s.type === 'preflight' && (
                <div className="field">
                  <label>Required permissions</label>
                  {['camera', 'screen', 'fullDesktop', 'mic'].map((k) => (
                    <label key={k} className="row" style={{ marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={!!s.config[k]}
                        onChange={(e) => patchConfig(active, k, e.target.checked)}
                        data-testid={`preflight-${k}`}
                      />
                      <span>{k === 'fullDesktop' ? 'Require full desktop (not a tab/window)' : k}</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="row" style={{ marginTop: 8 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={s.required} onChange={(e) => patchStep(active, { required: e.target.checked })} />
                <span>Required to advance</span>
              </label>
            </>
          ) : (
            <p className="muted">Add a step to begin.</p>
          )}
        </div>
      </div>
    </div>
  );
}
