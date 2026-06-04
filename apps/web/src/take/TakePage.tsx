import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { takeApi, applyBranding } from '../api';

type Phase = 'loading' | 'invalid' | 'welcome' | 'step' | 'finishing' | 'done';
type CheckState = 'pending' | 'ok' | 'bad';

interface Flow {
  flow_config: {
    recordingStart: string;
    timerStart: string;
    totalTimerSeconds: number;
  };
  steps: Array<{
    type: 'welcome' | 'consent' | 'preflight' | 'task' | 'finish';
    title: string;
    body_md: string;
    required: boolean;
    config: Record<string, any>;
  }>;
}

export function TakePage() {
  const { token } = useParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [info, setInfo] = useState<{ flow: Flow; participant_name?: string } | null>(null);
  const [brand, setBrand] = useState<{ productName: string; welcomeText: string; logoUrl: string | null }>({
    productName: 'SessionVault',
    welcomeText: "You've been invited to a recorded session. Here's what to expect:",
    logoUrl: null,
  });
  const [stepIdx, setStepIdx] = useState(0);

  // preflight state
  const [camOk, setCamOk] = useState<CheckState>('pending');
  const [screenOk, setScreenOk] = useState<CheckState>('pending');
  const [fullDesktopOk, setFullDesktopOk] = useState<CheckState>('pending');
  const [micOk, setMicOk] = useState<CheckState>('pending');
  const camPreviewRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // recording state
  const [recording, setRecording] = useState(false);
  const [timerLeft, setTimerLeft] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const recordersRef = useRef<MediaRecorder[]>([]);
  const segmentsRef = useRef<{ track: string; seq: number; storage_key: string; bytes: number }[]>([]);

  useEffect(() => {
    if (!token) return;
    takeApi.branding(token).then((d) => {
      applyBranding(d.branding);
      setBrand({ productName: d.branding.productName, welcomeText: d.branding.welcomeText, logoUrl: d.branding.logoUrl });
    }).catch(() => {});
    takeApi
      .resolve(token)
      .then((d) => {
        setInfo({ flow: d.flow, participant_name: d.participant_name });
        setPhase('welcome');
      })
      .catch((e) => {
        setError(e.message || 'invalid');
        setPhase('invalid');
      });
  }, [token]);

  // Timer countdown
  useEffect(() => {
    if (!recording) return;
    const total = info?.flow.flow_config.totalTimerSeconds ?? 1800;
    setTimerLeft(total);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(total - elapsed, 0);
      setTimerLeft(left);
      if (left === 0) {
        clearInterval(id);
        finalize('timeout');
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const step = info?.flow.steps[stepIdx];

  function logEvent(type: string, data: Record<string, any> = {}) {
    if (!token) return;
    const at = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    takeApi.event(token, { at_ms: at, type, data }).catch(() => {});
  }

  async function requestCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      camStreamRef.current = s;
      if (camPreviewRef.current) camPreviewRef.current.srcObject = s;
      setCamOk('ok');
    } catch {
      setCamOk('bad');
    }
  }

  async function requestScreen(needFullDesktop: boolean) {
    try {
      const s = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = s;
      setScreenOk('ok');
      const settings = s.getVideoTracks()[0]?.getSettings?.() ?? {};
      const surface = (settings as any).displaySurface;
      if (needFullDesktop) {
        setFullDesktopOk(surface === 'monitor' ? 'ok' : 'bad');
      } else {
        setFullDesktopOk('ok');
      }
      s.getVideoTracks()[0].addEventListener('ended', () => {
        if (recording) finalize('share_stopped');
      });
    } catch {
      setScreenOk('bad');
      setFullDesktopOk('bad');
    }
  }

  async function requestMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMicOk('ok');
    } catch {
      setMicOk('bad');
    }
  }

  function preflightPassed(): boolean {
    if (!step || step.type !== 'preflight') return true;
    const c = step.config;
    if (c.camera && camOk !== 'ok') return false;
    if (c.screen && screenOk !== 'ok') return false;
    if (c.fullDesktop && fullDesktopOk !== 'ok') return false;
    if (c.mic && micOk !== 'ok') return false;
    return true;
  }

  async function startRecording() {
    if (!token) return;
    await takeApi.start(token);
    startedAtRef.current = Date.now();
    logEvent('recording_start');
    logEvent('timer_start');

    // Capture screen + cam streams (separately so playback can show PiP).
    const tracks: { track: string; stream: MediaStream | null }[] = [
      { track: 'screen', stream: screenStreamRef.current },
      { track: 'webcam', stream: camStreamRef.current },
    ];
    const recorders: MediaRecorder[] = [];
    let seqCounter = { screen: 0, webcam: 0 };
    for (const { track, stream } of tracks) {
      if (!stream) continue;
      try {
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        rec.ondataavailable = async (e: BlobEvent) => {
          if (!e.data || e.data.size === 0) return;
          const seq = (seqCounter as any)[track]++;
          try {
            const pre = await takeApi.presign(token!, { track, seq, ext: 'webm' });
            await fetch(pre.url, { method: 'PUT', body: e.data });
            segmentsRef.current.push({ track, seq, storage_key: pre.storage_key, bytes: e.data.size });
          } catch (err) {
            console.warn('upload failed', err);
          }
        };
        rec.start(2000); // 2s segments for quick feedback
        recorders.push(rec);
      } catch (e) {
        console.warn('recorder init failed for', track, e);
      }
    }
    recordersRef.current = recorders;
    setRecording(true);
  }

  async function finalize(reason: string) {
    if (phase === 'finishing' || phase === 'done') return;
    setPhase('finishing');
    recordersRef.current.forEach((r) => {
      try { r.requestData(); } catch {}
      try { r.stop(); } catch {}
    });
    // Give ondataavailable a chance to upload last chunks
    await new Promise((r) => setTimeout(r, 1500));
    if (!token) return;
    try {
      await takeApi.finalize(token, { end_reason: reason, segments: segmentsRef.current });
    } catch (e) {
      console.warn(e);
    }
    [camStreamRef.current, screenStreamRef.current].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    setPhase('done');
  }

  async function advance() {
    if (!info) return;
    if (step?.type === 'preflight' && !preflightPassed()) return;
    logEvent('step_advance', { from: stepIdx });
    const next = stepIdx + 1;
    const nextStep = info.flow.steps[next];

    // Recording-start anchor logic.
    const ra = info.flow.flow_config.recordingStart;
    if (!recording) {
      if (ra === 'after_preflight' && step?.type === 'preflight') await startRecording();
      else if (ra === 'on_consent_accept' && step?.type === 'consent') await startRecording();
      else if (ra === 'on_first_task' && nextStep?.type === 'task') await startRecording();
    }

    if (!nextStep || nextStep.type === 'finish') {
      // entering the finish step
      if (nextStep?.type === 'finish') setStepIdx(next);
      else await finalize('submit');
      return;
    }
    setStepIdx(next);
  }

  // ---------- Renders ----------
  if (phase === 'loading') return <div className="center"><p>Loading…</p></div>;
  if (phase === 'invalid') {
    return (
      <div className="center">
        <div className="card take-card">
          <h2>Link unavailable</h2>
          <p className="muted">Reason: {error || 'invalid'}</p>
        </div>
      </div>
    );
  }
  if (phase === 'done') {
    return (
      <div className="center">
        <div className="card take-card fade-in" data-testid="take-done">
          <div className="take-brand">{brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{height:20}} /> : null}{brand.productName}</div>
          <div className="empty" style={{ padding: '20px 0 8px' }}>
            <div className="em-icon">✓</div>
            <h2 style={{ marginBottom: 6 }}>Session complete</h2>
            <p className="muted">
              Thanks{info?.participant_name ? `, ${info.participant_name}` : ''}. Your recording was
              uploaded successfully. You can close this window.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (phase === 'finishing') {
    return (
      <div className="center">
        <div className="card take-card">
          <h2>Finishing…</h2>
          <p className="muted">Uploading the last bits and finalizing the session.</p>
        </div>
      </div>
    );
  }
  if (phase === 'welcome') {
    return (
      <div className="center">
        <div className="card take-card fade-in" data-testid="take-welcome">
          <div className="take-brand">{brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{height:20}} /> : null}{brand.productName}</div>
          <h2 style={{ marginBottom: 8 }}>Hi {info?.participant_name || 'there'} 👋</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {brand.welcomeText}
          </p>
          <ul style={{ lineHeight: 1.9, paddingLeft: 18, color: 'var(--text)' }}>
            <li>You'll grant <b>camera</b> and <b>screen-share</b> permissions.</li>
            <li>Once started, a <b>timer</b> runs — you can't pause or restart.</li>
            <li>Everything is recorded and uploaded securely.</li>
          </ul>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="primary" onClick={() => setPhase('step')} data-testid="welcome-continue">
              Get started →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // step phase
  if (!step) return null;
  return (
    <div className="center">
      <div className="card take-card fade-in" data-testid={`take-step-${step.type}`}>
        <div className="take-brand" style={{ marginBottom: 14 }}>{brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{height:20}} /> : null}{brand.productName}</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{step.title}</h2>
          {recording && (
            <div className={`timer ${timerLeft < 60 ? 'low' : ''}`} data-testid="timer">
              {Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, '0')}
            </div>
          )}
        </div>
        {recording && (
          <div className="banner err" style={{ marginTop: 12, display: 'flex', alignItems: 'center' }}>
            <span className="recdot" /> Recording in progress
          </div>
        )}

        {step.body_md && <p style={{ whiteSpace: 'pre-wrap' }}>{step.body_md}</p>}

        {step.type === 'preflight' && (
          <div style={{ marginTop: 10 }}>
            {step.config.camera && (
              <div className="check" data-testid="check-camera">
                <span className={`dot ${camOk}`} />
                <span style={{ flex: 1 }}>Camera</span>
                <button onClick={requestCamera}>{camOk === 'ok' ? 'Re-check' : 'Grant'}</button>
              </div>
            )}
            {step.config.screen && (
              <div className="check" data-testid="check-screen">
                <span className={`dot ${screenOk}`} />
                <span style={{ flex: 1 }}>Screen share{step.config.fullDesktop ? ' (full desktop)' : ''}</span>
                <button onClick={() => requestScreen(!!step.config.fullDesktop)}>{screenOk === 'ok' ? 'Re-check' : 'Grant'}</button>
              </div>
            )}
            {step.config.mic && (
              <div className="check" data-testid="check-mic">
                <span className={`dot ${micOk}`} />
                <span style={{ flex: 1 }}>Microphone</span>
                <button onClick={requestMic}>{micOk === 'ok' ? 'Re-check' : 'Grant'}</button>
              </div>
            )}
            {camOk === 'ok' && (
              <video
                ref={camPreviewRef}
                className="preview"
                autoPlay
                playsInline
                muted
                style={{ marginTop: 10 }}
                data-testid="cam-preview"
              />
            )}
            {step.config.fullDesktop && screenOk === 'ok' && fullDesktopOk === 'bad' && (
              <div className="banner err" data-testid="not-full-desktop">
                You shared a tab/window. This session requires sharing the <b>entire screen</b>. Click "Re-check" and choose "Entire Screen".
              </div>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          {step.type === 'finish' ? (
            <button className="primary" onClick={() => finalize('submit')} data-testid="finish-submit">
              Submit
            </button>
          ) : (
            <button
              className="primary"
              disabled={step.type === 'preflight' && !preflightPassed()}
              onClick={advance}
              data-testid="step-continue"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
