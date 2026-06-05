import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { takeApi, applyBranding } from '../api';
import { sanitizeHtml } from '../ui/RichText';

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

// Build the runtime step sequence (consent → preflight → tasks) from either the
// new task-only model (flow_config.capture + consentText) or an old typed flow.
function normalizeFlow(flow: any): Flow {
  const fc = flow?.flow_config ?? {};
  const rawSteps: any[] = flow?.steps ?? [];
  const isNew = !!fc.capture || fc.consentText !== undefined;

  if (!isNew) {
    // Old typed flow: trust it, but ensure required/config defaults exist.
    return {
      flow_config: {
        recordingStart: fc.recordingStart ?? 'after_preflight',
        timerStart: fc.timerStart ?? 'on_recording_start',
        totalTimerSeconds: fc.totalTimerSeconds ?? 1800,
      },
      steps: rawSteps.map((s) => ({
        type: s.type ?? 'task',
        title: s.title ?? '',
        body_md: s.body_md ?? '',
        required: true,
        config: s.config ?? {},
      })),
    };
  }

  const cap = fc.capture ?? {};
  const steps: Flow['steps'] = [];
  if (fc.consentText) {
    steps.push({ type: 'consent', title: 'Consent & recording notice', body_md: fc.consentText, required: true, config: {} });
  }
  if (cap.camera || cap.screen || cap.mic) {
    steps.push({
      type: 'preflight',
      title: 'Device checks',
      body_md: '',
      required: true,
      config: { camera: !!cap.camera, screen: !!cap.screen, fullDesktop: !!cap.fullDesktop, mic: !!cap.mic },
    });
  }
  const tasks = rawSteps.length
    ? rawSteps.map((s) => ({ type: 'task' as const, title: s.title ?? 'Task', body_md: s.body_md ?? '', required: true, config: {} }))
    : [{ type: 'task' as const, title: 'Task', body_md: '', required: true, config: {} }];
  steps.push(...tasks);

  return {
    flow_config: {
      recordingStart: 'after_preflight',
      timerStart: 'on_recording_start',
      totalTimerSeconds: fc.totalTimerSeconds ?? 1800,
    },
    steps,
  };
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
  // Multiple monitors: one captured stream per shared screen.
  const screenStreamsRef = useRef<MediaStream[]>([]);
  const [screenCount, setScreenCount] = useState(1);
  const [sharedScreens, setSharedScreens] = useState(0);
  // Whether ANY step in this session requires full-desktop sharing.
  const fullDesktopRequiredRef = useRef(false);
  const surfaceWatchRef = useRef<number | null>(null);

  // recording state
  const [recording, setRecording] = useState(false);
  const [timerLeft, setTimerLeft] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const recordersRef = useRef<MediaRecorder[]>([]);
  const segmentsRef = useRef<{ track: string; seq: number; storage_key: string; bytes: number }[]>([]);
  // Local copy of every recorded chunk per track, kept in-browser so the
  // participant can always download the recording even if upload fails.
  const localBlobsRef = useRef<Record<string, Blob[]>>({ screen: [], webcam: [], mic: [] });
  const [uploadFailed, setUploadFailed] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);

  useEffect(() => {
    if (!token) return;
    takeApi.branding(token).then((d) => {
      applyBranding(d.branding);
      setBrand({ productName: d.branding.productName, welcomeText: d.branding.welcomeText, logoUrl: d.branding.logoUrl });
    }).catch(() => {});
    takeApi
      .resolve(token)
      .then((d) => {
        const flow = normalizeFlow(d.flow);
        setInfo({ flow, participant_name: d.participant_name });
        fullDesktopRequiredRef.current = flow.steps.some(
          (st) => st.type === 'preflight' && st.config?.fullDesktop,
        );
        detectScreens();
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

  // Detect how many physical screens the participant has. Uses the Window
  // Management API where available; falls back to 1.
  async function detectScreens() {
    try {
      const anyWin = window as any;
      if (anyWin.getScreenDetails) {
        // Requires the "window-management" permission; may prompt.
        const perm = await (navigator.permissions as any)
          ?.query?.({ name: 'window-management' as any })
          .catch(() => null);
        if (!perm || perm.state !== 'denied') {
          const details = await anyWin.getScreenDetails();
          const n = details?.screens?.length ?? 1;
          setScreenCount(Math.max(1, n));
          details.addEventListener?.('screenschange', () => {
            setScreenCount(Math.max(1, details.screens.length));
          });
          return;
        }
      }
      // Heuristic fallback: isExtended hints at >1 display (no exact count).
      if ((window.screen as any).isExtended) setScreenCount((c) => Math.max(c, 2));
    } catch {
      /* default 1 */
    }
  }

  // Add one shared screen. With multiple monitors, the participant calls this
  // once per screen until every monitor is covered.
  async function addScreen(needFullDesktop: boolean) {
    try {
      const constraints: any = { video: true, audio: false };
      if (needFullDesktop) {
        constraints.video = { displaySurface: 'monitor' };
        constraints.monitorTypeSurfaces = 'include';
        constraints.surfaceSwitching = 'exclude';
        constraints.selfBrowserSurface = 'exclude';
      }
      const s = await (navigator.mediaDevices as any).getDisplayMedia(constraints);
      const track = s.getVideoTracks()[0];
      const surface = (track?.getSettings?.() as any)?.displaySurface;

      if (needFullDesktop && surface !== 'monitor') {
        s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        setScreenOk('bad');
        setFullDesktopOk('bad');
        logEvent('share_rejected_not_full_desktop', { surface: surface ?? 'unknown' });
        return;
      }

      // Reject duplicate screen (same label already shared).
      const label = track?.label || '';
      const dup = screenStreamsRef.current.some(
        (st) => (st.getVideoTracks()[0]?.label || '') === label && label !== '',
      );
      if (dup) {
        s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        logEvent('share_duplicate_screen', { label });
        return;
      }

      screenStreamsRef.current.push(s);
      screenStreamRef.current = screenStreamsRef.current[0];
      setSharedScreens(screenStreamsRef.current.length);
      const covered = screenStreamsRef.current.length >= screenCount;
      setScreenOk(covered ? 'ok' : 'pending');
      setFullDesktopOk(covered ? 'ok' : 'pending');
      track.addEventListener('ended', () => {
        screenStreamsRef.current = screenStreamsRef.current.filter((x) => x !== s);
        setSharedScreens(screenStreamsRef.current.length);
        if (recording) finalize('share_stopped');
        else { setScreenOk('pending'); setFullDesktopOk('pending'); }
      });
    } catch {
      if (screenStreamsRef.current.length === 0) {
        setScreenOk('bad');
        setFullDesktopOk('bad');
      }
    }
  }

  async function requestScreen(needFullDesktop: boolean) {
    try {
      // Bias the picker toward entire-screen only. These hints make the browser
      // surface monitors first and hide the tab/window options where supported
      // (Chromium: monitorTypeSurfaces/surfaceSwitching). We still hard-verify below.
      const constraints: any = { video: true, audio: false };
      if (needFullDesktop) {
        constraints.video = { displaySurface: 'monitor' };
        constraints.monitorTypeSurfaces = 'include';
        constraints.surfaceSwitching = 'exclude';
        constraints.selfBrowserSurface = 'exclude';
      }
      const s = await (navigator.mediaDevices as any).getDisplayMedia(constraints);
      const track = s.getVideoTracks()[0];
      const surface = (track?.getSettings?.() as any)?.displaySurface;

      // Hard enforce: full desktop requires the 'monitor' surface. Anything else
      // (browser tab, window) — or a browser that can't report the surface — is
      // rejected. We never keep a partial/tab share when full desktop is required.
      if (needFullDesktop && surface !== 'monitor') {
        s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        screenStreamRef.current = null;
        setScreenOk('bad');
        setFullDesktopOk('bad');
        logEvent('share_rejected_not_full_desktop', { surface: surface ?? 'unknown' });
        return;
      }

      screenStreamRef.current = s;
      setScreenOk('ok');
      setFullDesktopOk('ok');
      track.addEventListener('ended', () => {
        if (recording) finalize('share_stopped');
      });
    } catch {
      setScreenOk('bad');
      setFullDesktopOk('bad');
    }
  }

  // Returns true if every required screen is still a valid, live monitor share.
  function screenSurfaceValid(): boolean {
    if (!fullDesktopRequiredRef.current) return true;
    const streams = screenStreamsRef.current;
    // All monitors must still be covered.
    if (streams.length < screenCount) return false;
    return streams.every((s) => {
      const track = s.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return false;
      return (track.getSettings?.() as any)?.displaySurface === 'monitor';
    });
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
    // Every detected monitor must be shared.
    if (c.screen && sharedScreens < screenCount) return false;
    if (c.mic && micOk !== 'ok') return false;
    return true;
  }

  async function startRecording() {
    if (!token) return;
    await takeApi.start(token);
    startedAtRef.current = Date.now();
    logEvent('recording_start');
    logEvent('timer_start');

    // Capture every shared screen (one track per monitor) + webcam.
    const screens = screenStreamsRef.current.length
      ? screenStreamsRef.current
      : screenStreamRef.current
      ? [screenStreamRef.current]
      : [];
    const tracks: { track: string; stream: MediaStream | null }[] = [
      ...screens.map((s, i) => ({ track: i === 0 ? 'screen' : `screen${i + 1}`, stream: s })),
      { track: 'webcam', stream: camStreamRef.current },
    ];
    const recorders: MediaRecorder[] = [];
    const seqCounter: Record<string, number> = {};
    for (const { track, stream } of tracks) {
      if (!stream) continue;
      try {
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        rec.ondataavailable = async (e: BlobEvent) => {
          if (!e.data || e.data.size === 0) return;
          // Always keep a local copy first — this is the download fallback.
          (localBlobsRef.current[track] ||= []).push(e.data);
          setHasLocal(true);
          const seq = (seqCounter as any)[track]++;
          try {
            const out = await takeApi.uploadSegment(token!, track, seq, e.data);
            segmentsRef.current.push({ track, seq, storage_key: out.storage_key, bytes: out.bytes });
          } catch (err) {
            console.warn('upload failed', err);
            setUploadFailed(true);
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

    // Continuously validate the share surface. Chrome lets users switch to
    // "share this tab/window instead" mid-session — if that happens (or the
    // share otherwise stops being the full monitor), end the session.
    if (fullDesktopRequiredRef.current) {
      surfaceWatchRef.current = window.setInterval(() => {
        if (!screenSurfaceValid()) {
          logEvent('full_desktop_lost');
          if (surfaceWatchRef.current) clearInterval(surfaceWatchRef.current);
          finalize('full_desktop_lost');
        }
      }, 1500);
    }
  }

  async function finalize(reason: string) {
    if (phase === 'finishing' || phase === 'done') return;
    if (surfaceWatchRef.current) { clearInterval(surfaceWatchRef.current); surfaceWatchRef.current = null; }
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
    [camStreamRef.current, ...screenStreamsRef.current].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    setPhase('done');
  }

  // Download the locally-buffered recording (per track) as WebM. Works even if
  // upload failed, so the participant can share the file another way.
  function downloadTrack(track: string) {
    const parts = localBlobsRef.current[track] || [];
    if (parts.length === 0) return;
    const blob = new Blob(parts, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const who = (info?.participant_name || 'session').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `${who}-${track}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadAll() {
    (['screen', 'webcam', 'mic'] as const).forEach((t, i) => {
      if ((localBlobsRef.current[t] || []).length) setTimeout(() => downloadTrack(t), i * 400);
    });
  }

  // Does the flow have any captured media to record? (a preflight requiring
  // camera or screen). If so, recording MUST start before the finish step.
  function flowRequiresCapture(): boolean {
    return (info?.flow.steps || []).some(
      (s) => s.type === 'preflight' && (s.config?.camera || s.config?.screen),
    );
  }

  async function advance() {
    if (!info) return;
    if (step?.type === 'preflight' && !preflightPassed()) return;
    logEvent('step_advance', { from: stepIdx });
    const next = stepIdx + 1;
    const nextStep = info.flow.steps[next];
    const enteringFinish = !nextStep || nextStep.type === 'finish';

    // Recording-start anchor logic.
    const ra = info.flow.flow_config.recordingStart;
    if (!recording) {
      if (ra === 'after_preflight' && step?.type === 'preflight') await startRecording();
      else if (ra === 'on_consent_accept' && step?.type === 'consent') await startRecording();
      else if (ra === 'on_first_task' && nextStep?.type === 'task') await startRecording();
    }

    // Safety net: never reach the finish step without recording when the flow
    // captures media but the configured anchor never fired (e.g. no task step,
    // or an anchor that doesn't match this flow's shape). This prevents the
    // session from jumping to the end without ever recording.
    if (!recording && enteringFinish && flowRequiresCapture() && (screenStreamsRef.current.length || camStreamRef.current)) {
      await startRecording();
    }

    if (enteringFinish) {
      if (nextStep?.type === 'finish') setStepIdx(next);
      else await finalize('submit');
      return;
    }
    setStepIdx(next);
  }

  // ---------- Renders ----------
  const shellHeader = (right?: React.ReactNode) => (
    <header className="take-head">
      <div className="take-brand">
        {brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{ height: 20 }} /> : null}
        {brand.productName}
      </div>
      {right}
    </header>
  );

  if (phase === 'loading') {
    return (
      <div className="take-shell">
        {shellHeader()}
        <main className="take-body"><p className="muted">Loading…</p></main>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="take-shell" data-testid="take-invalid">
        {shellHeader()}
        <main className="take-body">
          <div className="take-inner fade-in" style={{ textAlign: 'center' }}>
            <div className="take-hero-icon warn">!</div>
            <h2 style={{ marginTop: 16 }}>This link isn't available</h2>
            <p className="muted">
              {error === 'expired' ? 'This session link has expired.'
                : error === 'consumed' || error === 'closed' ? 'This session has already been completed.'
                : error === 'max_uses' ? 'This link has already been used.'
                : 'The link is invalid. Please check with your host.'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (phase === 'welcome') {
    return (
      <div className="take-shell" data-testid="take-welcome">
        {shellHeader(<span className="take-stepcount">Get ready</span>)}
        <main className="take-body">
          <div className="take-inner fade-in">
            <div className="take-hero-icon">▶</div>
            <span className="eyebrow" style={{ marginTop: 14, display: 'block' }}>Welcome</span>
            <h2 style={{ margin: '4px 0 0' }}>Hi {info?.participant_name || 'there'} 👋</h2>
            <p className="take-prose">{brand.welcomeText}</p>
            <ul className="take-bullets">
              <li><span className="bx">📷</span> You'll grant <b>camera</b> and <b>screen-share</b> access.</li>
              <li><span className="bx">⏱️</span> Once started, a <b>timer</b> runs — you can't pause or restart.</li>
              <li><span className="bx">🔒</span> Everything is recorded and stored securely for review.</li>
            </ul>
          </div>
        </main>
        <footer className="take-foot">
          <span className="take-foot-note">🔒 Your recording is stored securely for review.</span>
          <button className="primary lg" onClick={() => setPhase('step')} data-testid="welcome-continue">
            Get started →
          </button>
        </footer>
      </div>
    );
  }

  if (phase === 'finishing') {
    return (
      <div className="take-shell">
        {shellHeader(<span className="take-stepcount">Finishing</span>)}
        <main className="take-body">
          <div className="take-inner fade-in" style={{ textAlign: 'center' }}>
            <div className="take-hero-icon spin">◌</div>
            <h2 style={{ marginTop: 16 }}>Finishing up…</h2>
            <p className="muted">Uploading the last segments and finalizing your session. Please keep this window open.</p>
          </div>
        </main>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="take-shell" data-testid="take-done">
        {shellHeader(<span className="take-stepcount">Complete</span>)}
        <main className="take-body">
          <div className="take-inner fade-in" style={{ textAlign: 'center' }}>
            <div className={`take-hero-icon ${uploadFailed ? 'warn' : 'ok'}`}>{uploadFailed ? '!' : '✓'}</div>
            <h2 style={{ marginTop: 16 }}>{uploadFailed ? 'Session finished' : 'Session complete'}</h2>
            <p className="muted">
              Thanks{info?.participant_name ? `, ${info.participant_name}` : ''}.{' '}
              {uploadFailed
                ? 'Some parts may not have uploaded. Please download your recording below and share it with your host.'
                : 'Your recording was uploaded successfully. You can close this window.'}
            </p>

            {hasLocal && (
              <div style={{ marginTop: 22 }}>
                {uploadFailed && (
                  <div className="banner warn" style={{ marginBottom: 14, textAlign: 'left' }}>
                    Upload was incomplete — keep a local copy as a backup.
                  </div>
                )}
                <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="primary" onClick={downloadAll} data-testid="download-all">↓ Download recording</button>
                  {(['screen', 'webcam', 'mic'] as const).map((t) =>
                    (localBlobsRef.current[t] || []).length ? (
                      <button key={t} className="sm" onClick={() => downloadTrack(t)} data-testid={`download-${t}`}>{t}</button>
                    ) : null,
                  )}
                </div>
                <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
                  Files are saved as WebM. You can share them with your host directly.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // step phase
  if (!step) return null;
  const steps = info!.flow.steps;
  const totalSteps = steps.length;
  const preflightReady = step.type !== 'preflight' || preflightPassed();
  const isLastStep = stepIdx === totalSteps - 1 && step.type !== 'finish';

  function dotLabel(s: CheckState) {
    return s === 'ok' ? 'Granted' : s === 'bad' ? 'Blocked' : 'Pending';
  }

  return (
    <div className="take-shell" data-testid={`take-step-${step.type}`}>
      <header className="take-head">
        <div className="take-brand">
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{ height: 20 }} /> : null}
          {brand.productName}
        </div>
        {recording ? (
          <div className={`timer ${timerLeft < 60 ? 'low' : ''}`} data-testid="timer">
            <span className="recdot" />
            {Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, '0')}
          </div>
        ) : (
          <span className="take-stepcount">Step {stepIdx + 1} of {totalSteps}</span>
        )}
      </header>

      {/* progress stepper */}
      <div className="take-stepper" aria-hidden>
        {steps.map((st, i) => (
          <span
            key={i}
            className={`seg ${i < stepIdx ? 'done' : i === stepIdx ? 'current' : ''}`}
            title={st.title}
          />
        ))}
      </div>

      <main className="take-body">
        <div className="take-inner fade-in">
          {recording && uploadFailed && (
            <div className="banner warn">
              Some segments failed to upload. A local copy is being kept — you'll be able to download it at the end.
            </div>
          )}

          <span className="eyebrow">{step.type === 'preflight' ? 'Permissions' : step.type === 'consent' ? 'Before we begin' : step.type === 'finish' ? 'Final step' : 'Task'}</span>
          <h2 style={{ margin: '4px 0 0' }}>{step.title}</h2>
          {step.body_md && (
            <div
              className="take-prose rt-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(step.body_md) }}
            />
          )}

          {step.type === 'preflight' && !step.body_md && (
            <p className="take-prose">
              Grant the permissions below. We'll show a live preview so you can confirm everything works
              before the session starts.
              {step.config.fullDesktop && (
                <> When prompted to share, you <b>must choose “Entire Screen”</b> — sharing a tab or window
                will be rejected, and switching away from full-screen during the session will end it.</>
              )}
            </p>
          )}
          {step.type === 'preflight' && (
            <div className="take-checks">
              {step.config.camera && (
                <div className="check" data-testid="check-camera">
                  <span className={`dot ${camOk}`} />
                  <span className="check-main">
                    <span className="check-name">Camera</span>
                    <span className="check-state">{dotLabel(camOk)}</span>
                  </span>
                  <button onClick={requestCamera}>{camOk === 'ok' ? 'Re-check' : 'Grant access'}</button>
                </div>
              )}
              {step.config.screen && (
                <div className="check" data-testid="check-screen">
                  <span className={`dot ${screenOk}`} />
                  <span className="check-main">
                    <span className="check-name">
                      Screen share{step.config.fullDesktop ? ' · entire screen' : ''}
                      {screenCount > 1 && <> · {sharedScreens}/{screenCount} screens</>}
                    </span>
                    <span className="check-state">
                      {screenCount > 1 && screenOk !== 'ok'
                        ? `You have ${screenCount} monitors — share each one`
                        : dotLabel(screenOk)}
                    </span>
                  </span>
                  <button onClick={() => addScreen(!!step.config.fullDesktop)} data-testid="grant-screen">
                    {screenOk === 'ok' ? 'Re-check' : screenCount > 1 && sharedScreens > 0 ? 'Add next screen' : 'Grant access'}
                  </button>
                </div>
              )}
              {step.config.screen && screenCount > 1 && screenOk !== 'ok' && (
                <div className="banner warn" data-testid="multi-screen-note">
                  We detected <b>{screenCount} monitors</b>. All screens must be shared. Click
                  “{sharedScreens > 0 ? 'Add next screen' : 'Grant access'}” and pick a different screen each time
                  ({sharedScreens} of {screenCount} shared).
                </div>
              )}
              {step.config.mic && (
                <div className="check" data-testid="check-mic">
                  <span className={`dot ${micOk}`} />
                  <span className="check-main">
                    <span className="check-name">Microphone</span>
                    <span className="check-state">{dotLabel(micOk)}</span>
                  </span>
                  <button onClick={requestMic}>{micOk === 'ok' ? 'Re-check' : 'Grant access'}</button>
                </div>
              )}
              {camOk === 'ok' && (
                <video ref={camPreviewRef} className="preview" autoPlay playsInline muted data-testid="cam-preview" />
              )}
              {step.config.fullDesktop && fullDesktopOk === 'bad' && (
                <div className="banner err" data-testid="not-full-desktop">
                  This session requires sharing your <b>entire screen</b>. Tab and window sharing aren't
                  allowed — click <b>Grant access</b> again and choose <b>Entire Screen</b> in the picker.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="take-foot">
        <span className="take-foot-note">
          {step.type === 'preflight' && !preflightReady
            ? 'Grant all required permissions to continue.'
            : recording
            ? '🔴 Recording — do not close this window.'
            : '🔒 Your recording is stored securely for review.'}
        </span>
        {step.type === 'finish' ? (
          <button className="primary lg" onClick={() => finalize('submit')} data-testid="finish-submit">
            Submit session
          </button>
        ) : isLastStep ? (
          <button
            className="primary lg"
            disabled={!preflightReady}
            onClick={advance}
            data-testid="finish-submit"
          >
            Submit session
          </button>
        ) : (
          <button
            className="primary lg"
            disabled={!preflightReady}
            onClick={advance}
            data-testid="step-continue"
          >
            Continue →
          </button>
        )}
      </footer>
    </div>
  );
}
