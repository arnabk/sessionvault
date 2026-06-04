<div align="center">

# SessionVault

**Create guided remote sessions. Enforce preflight. Record. Upload. Review.**

Open-source, self-hostable, S3-compatible recorded-session capture & review platform.

</div>

---

SessionVault lets a host author a multi-step session flow (consent → preflight → task → finish),
mint a unique token-gated participant link, enforce capture conditions (required camera, full-desktop
screen share, optional mic), record the session in the browser, upload artifacts directly to
**S3-compatible object storage**, and review the recording later with a synced multi-track player
and an event timeline.

Interviews and proctored assessments are the first use case — but SessionVault is a general
**capture → store → review** platform.

## What you can build with SessionVault

Anywhere you need to *send a link, enforce conditions, record what happens, and review it later*:

**Hiring & assessment**
- Proctored technical interviews with full-desktop + webcam recording.
- Take-home coding assessments with a hard timer and integrity event log.
- Live whiteboard / system-design sessions captured for the whole panel to review.
- Language and communication assessments with mic + camera.
- Sales/role-play evaluations recorded against a scoring rubric.

**Education & certification**
- Remote proctored exams with camera + screen gating.
- Certification practicals where the candidate must demonstrate a task on screen.
- Tutoring or lab-session recordings for grading and feedback.
- Open-book assessments with telemetry to flag tab-switching.

**Onboarding & training**
- New-hire setup walkthroughs recorded as proof-of-completion.
- Software training where trainees complete a guided task on their real desktop.
- Skills sign-off sessions captured for an auditor or manager to review.
- Compliance training attestations with a recorded acknowledgement step.

**Compliance, audit & security**
- Compliance walkthroughs (SOC2 / ISO / HIPAA evidence capture) on your own storage.
- Access-review or privileged-action sessions recorded for an audit trail.
- Incident-response reproductions captured with a synced event timeline.
- Regulated workflows where recordings must stay on-premises in a private bucket.

**Support, QA & research**
- Customer bug reproductions: send a link, capture the exact screen + steps.
- Usability testing sessions with webcam, screen, and think-aloud audio.
- Moderated user research with a guided multi-step task flow.
- QA acceptance walkthroughs recorded as release evidence.

**Sales, demos & verification**
- Recorded product demos delivered as a guided, timed flow.
- Identity / KYC-style verification sessions (capture document + camera on your infra).
- Partner / vendor capability demonstrations captured for sign-off.
- Remote inspections where someone must show a real environment on screen.

> Every flow is authored in the **Session Builder** — choose the steps, the required
> permissions, when recording starts, and when the timer starts. Interviews are just `config`.

## Why SessionVault

- **Preflight gating** — the session cannot start until required permissions are validated.
- **Full-desktop enforcement** — not tab-only, when the use case demands it.
- **Configurable anchors** — admin decides exactly *when* recording and the timer start.
- **S3-compatible, BYO storage** — AWS S3, Cloudflare R2, MinIO, Garage; or a customer-owned bucket.
- **Deploy anywhere** — one image set runs in local Docker Compose *and* any Kubernetes cluster.
- **Privacy-first** — keep sensitive recordings on your own infrastructure.

## Quick start

Runs the whole stack (app + Postgres + MinIO) behind **Caddy with automatic HTTPS**:

```bash
git clone https://github.com/arnabk/sessionvault.git && cd sessionvault
cp .env.example .env          # defaults are fine for localhost
docker compose up -d --build
# Admin:  https://localhost/admin   (login: admin / admin — change it!)
# Taker:  https://localhost/take/<token>
```

`SV_DOMAIN=localhost` uses a self-signed cert (browser warning is expected).
For a **public machine**, set `SV_DOMAIN` to your domain and SessionVault gets a
free **Let's Encrypt** certificate automatically.

See **[Deployment](docs/operations/deployment.md)** for public hosting, external
S3/R2, backups, and config, and [Local development](docs/guides/local-dev.md) for
the hot-reload dev workflow.

## Documentation

All documentation lives in [`docs/`](docs/README.md). This README only points there.

- [Product & architecture spec](SPEC.md) — the full 16-section design document.
- [Documentation index](docs/README.md) — architecture, data model, API, guides, operations, ADRs.

## Project status

Pre-alpha. Phase 1 (MVP) in progress. See the [roadmap](SPEC.md#14-implementation-phases).

## License

[MIT](LICENSE). Use, modify, and self-host freely.
