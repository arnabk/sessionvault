# SessionVault — Product & Architecture Spec

Open-core, self-hostable platform to create guided remote sessions, enforce preflight requirements, record participant artifacts (webcam/screen/mic/telemetry), upload to S3-compatible storage, and review later.

---

## 1. Product definition

**SessionVault** is a recorded-session capture, upload, and review platform. A host defines a session template with rules (required camera, required full-desktop share, optional mic, timer, instructions). The platform mints a unique participant link. When a participant opens it, a strict **preflight gate** validates device/permission requirements before the timer can start. During the session the browser captures webcam, full screen share, optional mic, and lightweight telemetry, streaming artifacts to **S3-compatible object storage**. Sessions end on submit, timeout, loss of required permission, or admin force-end. Hosts then replay, scrub, annotate, and analyze the session, with a system-event timeline (camera off, share stopped, tab hidden, reconnect, upload incomplete).

The core problem: today there is no privacy-first, self-hostable way to *enforce capture conditions*, reliably record long sessions, and store sensitive recordings on your own infrastructure. Generic video tools (Zoom, Loom) record meetings but don't gate preflight requirements, don't enforce full-desktop share, and push media to a vendor cloud. Screen recorders (OBS, browser plugins) require install and have no orchestration, link flow, rules engine, or review surface. Interview platforms (HackerRank, HireVue) are closed SaaS, interview-only, and store candidate PII off-prem.

- **Primary users:** Hosts/recruiters/auditors/trainers who issue sessions; Reviewers/admins who replay & score; Participants who complete sessions; Operators who self-host.
- **Primary use cases (v1 → later):** technical/proctored interviews & take-homes → onboarding walkthroughs, compliance/audit recordings, customer demos, training certification, support reproduction capture.
- **Why different:** (a) *Preflight gating* — session cannot start until required permissions validated; (b) *Full-desktop enforcement*, not tab-only; (c) *Capture-condition rules engine* with auto-end; (d) *S3-compatible, BYO-bucket storage* including customer-managed buckets; (e) *Open-core self-hosting* as a first-class mode, not an afterthought.

**Naming note.** "SessionVault" beats an interview-specific name because the product is a *session* recorder/reviewer, not an interviewing tool — interviews are use case #1. The adjacent market (session recording, session replay, session review) is semantically aligned, so "SessionVault" signals broad scope (capture → store → review) and a privacy/"vault" storage posture, which is the actual differentiator. An interview-branded name would cap positioning and confuse the onboarding/audit/training expansions.

---

## 2. Core user flows

### 2.1 Host creates a session template
1. Host authenticates → selects Project.
2. Creates template: name, instructions (markdown), task assets, **rules** (camera required Y/N, screen-share required + `fullDesktopRequired`, mic optional, telemetry on/off), timer (hard/soft, grace), retention class, reviewer assignment, branding.
3. Validates rules (e.g. `fullDesktopRequired` implies `getDisplayMedia` surface check). Saves as versioned template (immutable once a session is issued against it; edits fork a new version).

### 2.2 Host sends participant link
1. Host issues Session from template → backend mints `session_id` + signed, single-use (or N-use) token with expiry.
2. Link delivered via UI copy, email, webhook, or ATS integration. Optional pre-auth (email match / OTP / SSO) before preflight.

### 2.3 Participant opens link + preflight
1. Token validated (not expired/consumed, session OPEN). Compatibility check (browser supports `getDisplayMedia`, `MediaRecorder`, codecs).
2. Sequential consent + permission gate:
   - **Camera** → `getUserMedia({video})`; show live preview; verify track active.
   - **Mic** (if enabled) → request + verify.
   - **Screen share** → `getDisplayMedia()`; if `fullDesktopRequired`, inspect `track.getSettings().displaySurface === 'monitor'`; reject `'window'`/`'browser'` with retry instructions.
3. Explicit consent screen (recording notice, retention, data-residency statement). All requirements green → "Start". Timer starts **only** after start + a recording-warmup OK signal.

### 2.4 Participant completes timed session
1. Instructions/task screen; recording active; timer visible. Heartbeats to realtime service.
2. Continuous track-health monitoring (camera/share live, mic if required). Telemetry events buffered (visibility change, fullscreen exit, focus loss, copy/paste if enabled, reconnects).
3. Segments uploaded **during** the session (chunked, resumable) so finalization is fast and crash-loss is bounded.

### 2.5 Upload + finalize
1. End trigger fires (submit/timeout/permission loss/force-end).
2. Recorder flushes final segment(s); client completes any open multipart uploads.
3. Client posts **segment manifest** (per track: ordered segment keys, byte ranges, durations, checksums). Backend verifies all parts present (HEAD each key) → marks session `COMPLETE`; missing/mismatch → `INCOMPLETE`/`CORRUPT` with reason.
4. Post-upload workers transcode/normalize, build playback manifest (HLS/fMP4), extract thumbnails, optionally transcribe.

### 2.6 Reviewer playback + analysis
1. Reviewer opens session → synced player: desktop main track, webcam PiP, mic audio, event timeline overlay.
2. Scrub, jump to flagged events, add timestamped annotations/notes, score against rubric, export clips/evidence bundle, download originals (if permitted).

### 2.7 Failure & recovery + edge cases
- **Camera denied / share denied** → preflight blocks; session never starts; cannot consume token.
- **Tab-only share when full desktop required** → reject with explicit "share *Entire Screen*" guidance + retry; no start.
- **Share/camera stops mid-session** → grace countdown; resume or auto-end per rule; event logged.
- **Upload interrupted** → resumable multipart resumes from last acked part; offline buffering then drain on reconnect.
- **Browser crash / reload / tab close** → on reopen, client restores session state from local buffer + server segment ledger; resumes uploads; if unrecoverable, session marked `INCOMPLETE` with partial artifacts preserved.
- **Timer expires during upload** → recording stops; session enters `FINALIZING`; upload continues in background with extended grace window; only `COMPLETE` once all parts acked.
- **Permission revoked at OS level** → track ends → treated as stop trigger.

---

## 3. Feature list

**Session creation:** templates, versioning, instructions (markdown + assets), per-session overrides, scheduled/expiring links, single/multi-use tokens, pre-auth (email/OTP/SSO), batch issuance, branding per project.

**Template management:** rule presets, clone/fork, library, required-field validation, draft/publish, archival.

**Timer & rules engine:** hard/soft timer, grace periods, required-camera gate, required screen-share gate, `fullDesktopRequired`, optional mic, auto-end on timeout, auto-end on required-permission loss, force-end, configurable end triggers, telemetry toggles, declarative rule DSL.

**Recording & capture:** webcam, full-desktop/screen, optional mic, event telemetry, multi-track sync, in-session segmented upload, warmup validation, codec/quality config, local buffering, crash-resilient ledger.

**Upload & storage:** chunked + resumable multipart, **direct-to-storage presigned** uploads, segment manifests, checksums (per-part + whole-object), retries/backoff, offline drain, integrity verification.

**Playback & review:** synced multi-track player, webcam PiP, timeline scrub, event markers, annotations/notes, rubric scoring, jump-to-event, clip export, evidence bundle, original download (gated).

**Security & compliance:** tenant isolation, encryption in transit/at rest, signed URLs, RBAC, audit logs, retention/legal hold, PII controls, data residency, consent capture, customer-managed buckets.

**Self-hosting & infra:** Docker Compose single-node, Helm/K8s, BYO S3/Postgres/Redis-or-NATS, local MinIO dev, config via env/secrets, health/readiness, backup/restore, migrations.

**Admin & team mgmt:** orgs/workspaces/projects, roles, invites, SSO/SAML (enterprise), quotas, usage metering, branding, domains.

**APIs & integrations:** REST + webhooks, session/template CRUD, upload-complete callback, annotations API, export jobs, SSO, ATS/HRIS, Slack/email, external AI pipeline hooks.

**Analytics & observability:** session funnel (issued→started→completed), failure reasons, storage accounting per tenant, OpenTelemetry traces/metrics/logs, dashboards, alerting.

**Extensibility / plugins:** storage provider drivers, auth providers, notification channels, webhook subscriptions, post-processing pipeline steps, rule-engine extensions, AI processors.

---

## 4. Storage architecture

**Principle:** the *only* media storage interface is an **S3-compatible API**. Everything else (DB, queue) holds metadata/pointers. Targets: AWS S3, Cloudflare R2, MinIO, Garage today; SeaweedFS, RustFS as advanced options. Any S3 v4-signature endpoint works via one driver.

### 4.1 Provider abstraction layer
Single `ObjectStore` interface so swapping MinIO→S3→R2 needs only config:
```
ObjectStore {
  presignPut(key, opts) ; presignGet(key, ttl)
  createMultipart(key) ; presignPart(uploadId, key, partNo)
  completeMultipart(uploadId, key, parts[]) ; abortMultipart(...)
  head(key) ; delete(key) ; copy(src,dst)
  listPrefix(prefix, cursor)
}
```
Implemented with the AWS SDK v3 S3 client pointed at a configurable `endpoint` + `forcePathStyle` (needed for MinIO/Garage). Capability flags per provider (lifecycle? object-lock? storage classes? server-side copy?) so the app degrades gracefully (e.g. emulate lifecycle via a sweeper job if backend lacks it — Garage).

### 4.2 Bucket layout & naming
- **Bucket-per-tenant** (preferred for isolation/accounting/legal hold) in SaaS; **single shared bucket with tenant prefix** acceptable for small self-host.
- Key convention:
  `org/{org_id}/project/{project_id}/session/{session_id}/track/{track}/seg/{seq:08d}.{ext}`
  plus `…/session/{session_id}/manifest.json` and `…/derived/{playback,thumbs,transcript}/…`.
- Immutable, content-addressed segment names (include short checksum) to make retries idempotent and dedupe safe.

### 4.3 Multipart & resumable uploads
- Tracks split into **time-bounded segments** (e.g. 5–10s fMP4); large segments use multipart with **presigned part URLs** → client uploads **direct to storage**, backend never proxies media bytes.
- Resumability: client keeps a local ledger (uploadId, parts acked, etags). On reconnect, `listParts`/HEAD reconciles, re-presigns missing parts, then `completeMultipart`.
- Backend records a **segment ledger** row per part so finalize can verify independently of the client.

### 4.4 Lifecycle, retention, archival, cold storage
- **Retention classes** on templates → mapped to lifecycle rules: e.g. `hot 30d → infrequent 90d → archive/Glacier/R2-IA → delete at N`.
- Where backend lacks native lifecycle (Garage), a **retention sweeper** worker enforces transitions/expiry from DB-driven policy.
- **Cold archive** for originals after playback derivatives exist; keep playback manifest hot, originals cold, restore-on-demand.

### 4.5 Encryption & signed URLs
- TLS in transit. SSE-S3/SSE-KMS where supported; otherwise app-layer envelope encryption (per-object DEK wrapped by tenant KEK) before upload.
- **All access via short-TTL presigned URLs** (PUT for upload, GET for playback/download). No public buckets. Playback uses per-segment signed URLs or signed manifest with rotating tokens.

### 4.6 Metadata indexing & storage classes
- Postgres is source of truth for artifact metadata (keys, sizes, checksums, durations, codecs, track map, integrity status). Object store holds bytes only.
- Storage class selection per artifact type (derivatives = standard/hot; originals = cold-eligible).

### 4.7 Deletion, legal hold, migration
- **Soft delete** (tombstone + grace) → hard delete worker. **Legal hold** blocks deletion/lifecycle (use Object Lock where available; else policy flag enforced by sweeper).
- **Migration between backends:** background copy job reads via source driver, writes via target driver, verifies checksums, repoints DB keys, then deletes source — supports MinIO→S3/R2 moves.

### 4.8 Customer-managed bucket mode (key feature)
- Metadata stays in SessionVault; **media goes directly to a customer-owned S3-compatible bucket**. Customer supplies endpoint + scoped credentials (or cross-account role) with least privilege (PutObject/Multipart on their prefix, GetObject for playback presign).
- SessionVault stores only keys/pointers + checksums; never holds the bytes. Presigned URLs generated with the customer's credentials. Realistic precisely because S3/R2/MinIO share the API surface.

---

## 5. Technical architecture

### 5.1 Subsystems
- **Web app / admin dashboard** — host & reviewer SPA (templates, sessions, playback, RBAC, settings).
- **Participant session client** — hardened browser app: preflight gate, capture, segmenter, uploader, telemetry, heartbeat.
- **Backend API** — sessions/templates/tokens/RBAC/presign orchestration; issues all signed URLs.
- **Realtime coordination service** — heartbeats, live session state, force-end commands, track-health signals (WebSocket).
- **Recording pipeline (client-side capture + server post-processing)** — see §6.
- **Upload service** — presign multipart, segment ledger, finalize/verify.
- **Review/playback service** — playback manifest assembly, signed segment delivery, annotations.
- **Worker/queue system** — transcode, thumbnail, transcribe, retention sweep, migration, hard-delete, webhooks.
- **Metadata DB** — Postgres.
- **Search/indexing** — Postgres FTS first; OpenSearch optional later for transcripts/events.
- **Object storage layer** — `ObjectStore` driver (§4).
- **Auth & RBAC** — OIDC, sessions, org/project scoped roles.
- **Audit logging** — append-only event log.
- **Notifications** — email/Slack/webhooks.

### 5.2 Recommended stack (boring, reliable, self-host-friendly)
- **Frontend:** TypeScript, React + Vite, TanStack Query, Tailwind. Participant client kept dependency-light.
- **Backend:** TypeScript on Node (NestJS or Fastify) — *or* Go if a single static binary for self-host is preferred. Recommend **Go for backend** to ship one binary + great concurrency for upload/finalize; React/TS frontend. (If team is TS-only, NestJS is fine.)
- **DB:** PostgreSQL.
- **Queue:** start with **Postgres-backed queue** (e.g. River/pgmq) for single-node simplicity; **NATS JetStream** or Redis Streams when scaling workers. Avoid Kafka unless forced.
- **Storage abstraction:** AWS SDK v3 S3 client, configurable endpoint/path-style.
- **Auth:** OIDC via Keycloak/Authentik (self-host) or hosted IdP; app-issued sessions/JWT. SAML/SSO = enterprise tier.
- **Observability:** OpenTelemetry → Prometheus + Grafana + Loki/Tempo; Sentry for app errors.
- **Infra:** Docker Compose (single-node), Helm chart (K8s). Terraform modules optional for managed cloud.
- **Local dev:** Compose stack = app + Postgres + **MinIO** + NATS/Redis; seeded buckets/policies.

### 5.3 Media recording strategy (recommendation)
- **Primary:** browser **MediaRecorder** producing chunked fMP4/WebM, **directly uploaded to object storage** via presigned multipart. Lowest server cost, simplest self-host.
- **Local buffering:** IndexedDB/OPFS ring buffer so segments survive reload/crash and uploads resume.
- **Optional backend mirror / WebRTC ingest** (SFU) only for live-proctoring/low-latency use cases — *not* in MVP; adds heavy ops.
- **Post-upload processing:** server-side ffmpeg workers normalize/transcode to a consistent codec, build HLS/fMP4 playback manifests, generate thumbnails, optionally transcribe. Keep originals; serve derivatives.

**Tradeoff:** MediaRecorder-direct is cheap and self-host-friendly but offers weaker liveness guarantees than WebRTC SFU; mitigate with heartbeats + in-session segmented upload so loss is bounded to the last few seconds.

---

## 6. Recording model

### 6.1 Tracks & format
- Separate logical tracks: `screen`, `webcam`, `mic` (optional), `events` (JSONL telemetry). Recording each independently simplifies sync, partial upload, and selective retention.
- Format: **fragmented MP4 (fMP4) with H.264/AAC** for broad playback; WebM/VP8/9 fallback where MP4 capture unavailable. Normalize to one delivery codec post-upload.

### 6.2 Chunking & segment manifests
- **Time-bounded segments** ~5–10s, each independently finalizable and uploadable. Each segment carries: `seq`, `track`, `startTs`, `duration`, `bytes`, `sha256`.
- Per-session **manifest.json**: ordered segment list per track + global session clock offsets for cross-track sync, plus integrity summary.

### 6.3 Synchronization
- Single monotonic **session clock** (start at warmup-OK). Each segment stamped with offset from clock; events stamped on same clock. Playback aligns tracks by offset, not wall time, avoiding drift.

### 6.4 Finalization & integrity
- On end: flush partial segment, complete open multiparts, upload manifest.
- Backend **verifies** every manifest segment exists (HEAD) and checksum matches the ledger row. All good → `COMPLETE`. Gaps/mismatch → `INCOMPLETE` or `CORRUPT` with machine-readable reason; partial artifacts retained for review.
- **Session integrity model:** per-segment sha256 + ordered manifest + server-side ledger = tamper-evidence (any post-hoc edit breaks checksums/sequence). Optional signed manifest hash for stronger evidence.

### 6.5 Interruption recovery
- Client ledger (OPFS/IndexedDB) + server segment ledger = two-sided source of truth. On reload, reconcile, resume open multiparts, continue from last `seq`.
- Crash with unflushed buffer → last segment may be lost; manifest marks the gap; session `INCOMPLETE` not silently truncated.

### 6.6 Unified playback from multiple artifacts
- Playback service reads manifest, generates signed segment URLs per track, builds an HLS/fMP4 playlist (or client-side MSE timeline) that the player aligns via session-clock offsets → desktop main + webcam PiP + audio + event overlay as one synced experience.

---

## 7. Review experience

### 7.1 Player
- Desktop recording as main canvas; **webcam picture-in-picture** (movable, toggle); mic audio synced; single transport bar driving all tracks via session clock.
- **Timeline scrubbing** with thumbnail previews; speed control; frame-step.
- **Event timeline overlay**: markers for camera off, screen-share stopped, reconnect, tab hidden/visibility change, fullscreen exit, permission revoked, upload incomplete, copy/paste (if captured). Click marker → seek.

### 7.2 Review tools
- **Annotations/notes** timestamped, threaded, per-reviewer; **rubric scoring** with weighted criteria.
- **Jump-to-suspicious**: filtered list of flagged events; next/prev navigation.
- **Export**: clip a time range → derived MP4; **evidence bundle** (selected clips + manifest + checksums + event log + annotations, zipped, hash-stamped); **download originals** if role permits and not legal-restricted.

### 7.3 Future AI features
- Auto **transcript** (Whisper-class) → searchable; **summary** of session; **timeline highlights**; **event correlation** (e.g. tab-hidden + paste spikes); **suspicious-behavior detection** (gaze/face presence, multi-monitor hints, paste bursts) surfaced as *signals, not verdicts*; **scoring assistance** suggesting rubric scores with citations to timestamps. All AI runs as post-upload pipeline steps and is enterprise/opt-in for privacy.

---

## 8. Security and trust model

- **Tenant isolation:** org_id scoping on every row + query; bucket-per-tenant (or enforced prefix) for media; per-tenant KEK.
- **Encryption:** TLS everywhere; SSE-KMS or app-layer envelope encryption at rest; secrets in a vault/secret store, never in DB plaintext.
- **Storage credentials:** least-privilege scoped keys; customer-managed-bucket creds stored encrypted; prefer short-lived/role-based where backend supports.
- **Signed URLs:** short TTL, method-scoped (PUT vs GET), key-scoped; no public buckets; playback tokens rotate.
- **RBAC / least privilege:** roles owner/admin/host/reviewer/viewer; project-scoped; participant tokens carry only their session's capabilities.
- **Secure uploads:** direct-to-storage presigned only; server validates content-type/size; checksum verification on finalize.
- **Tamper evidence:** per-segment sha256 + ordered manifest + server ledger; optional signed manifest hash; immutable audit log.
- **Audit logs:** append-only, who/what/when for issuance, access, download, deletion, force-end, config changes; exportable (enterprise).
- **Retention controls:** per-template retention class; legal hold overrides lifecycle.
- **PII handling:** consent capture stored with session; configurable redaction (e.g. blur webcam) as processing step; minimize PII in metadata.
- **Data residency:** per-project region/bucket selection; customer-managed bucket = data never leaves customer infra.
- **Deletion workflows:** soft-delete → grace → hard-delete worker; legal hold blocks; deletion audited.

---

## 9. Self-hosting strategy

**First-class. Optimize for operational simplicity.**

### 9.1 Deployment modes
- **Single-node Docker Compose** (small teams): app + Postgres + MinIO + NATS(or Redis) + reverse proxy/TLS. One `docker compose up`, `.env` config, seeded buckets.
- **Kubernetes/Helm** (larger orgs): separate deployments for API, realtime, workers (autoscaled), with external Postgres/Redis/NATS and external S3/R2/MinIO.
- **BYO everything:** external Postgres, external queue, **any S3-compatible storage**, external IdP.

### 9.2 Required vs optional
- **Required:** Postgres, an S3-compatible bucket, the app. **Optional:** external queue (else Postgres-backed queue), external IdP (else built-in auth), object-lock/lifecycle (else sweeper), observability stack, transcoding workers (degrade to raw playback).

### 9.3 Upgrades / backup / restore
- **Upgrades:** versioned images + forward-only DB migrations run on boot; documented compatibility matrix; blue/green for K8s.
- **Backup:** Postgres dump/PITR + object-store versioning/replication; manifests + checksums make media verifiable post-restore.
- **Restore:** restore Postgres, point at same bucket(s); integrity verifier reconciles DB ledger vs object store, flags gaps.
- **Simplicity without sacrificing scale:** same image runs single-node and clustered; scale by adding worker replicas + external queue/storage — no code changes.

---

## 10. Multi-tenant SaaS model

- **Hierarchy:** Organization → Workspace/Project → Templates/Sessions. Users belong to org with project-scoped roles.
- **Quotas:** sessions/month, concurrent sessions, storage GB, retention max; enforced at issuance + upload.
- **Per-tenant storage accounting:** sum artifact bytes per org from DB ledger (cheap, no list calls); used for metering/billing/quota.
- **RBAC:** owner/admin/host/reviewer/viewer + custom roles (enterprise).
- **Billing hooks:** usage events (sessions, storage-GB-month, transcode minutes, AI minutes) → Stripe/metering; webhooks for invoicing.
- **Retention settings:** per-project defaults + per-template overrides.
- **Branding & domains:** per-project logo/colors; custom domain / CNAME for participant links (enterprise).
- **Usage metering:** OpenTelemetry + billing events; dashboards per tenant.

---

## 11. API and integrations

- **REST API** (OpenAPI): templates CRUD, sessions issue/list/get/force-end, tokens, presign-upload init/part/complete, artifacts/manifest, annotations CRUD, exports, retention/legal-hold.
- **Webhooks:** `session.issued/started/completed/incomplete`, `artifact.uploaded`, `processing.done`, `annotation.created`, `export.ready`, with HMAC signatures + retries.
- **Upload-complete callback:** finalize endpoint verifies manifest → emits `session.completed`.
- **SSO:** OIDC (core), SAML (enterprise).
- **ATS/HRIS:** issue sessions + push results to Greenhouse/Lever/Workday via connectors/webhooks.
- **Notifications:** Slack app + email (link delivery, completion, flags).
- **External AI pipeline:** pluggable processor steps receive signed artifact URLs + manifest, return transcript/summary/signals via callback.

---

## 12. Licensing / packaging

**Single product, one deployable. No enterprise tier (dropped per scope decision).** All features ship in one image set; same artifact runs local Docker Compose and any K8s cluster.

- **License:** Apache-2.0 (max adoption) or AGPL-3.0 (protect against closed SaaS forks). Default recommendation: **AGPL-3.0** for the SaaS, keeping self-hosting unrestricted.
- **No paid gating** of SSO(OIDC), RBAC, customer-managed buckets, retention. Everything is in-core.

---

## 13. MVP definition

**In:** template (camera-required, screen-share-required + full-desktop, optional mic, timer) → unique single-use link → preflight gate (camera + full-desktop validation, denial blocks start) → browser MediaRecorder capture (screen + webcam + optional mic) → in-session **chunked/resumable presigned multipart upload direct to S3-compatible storage** → finalize + integrity verify → reviewer playback page (synced desktop + webcam PiP + event timeline) → annotations/notes → **Docker Compose self-host with MinIO** + Postgres.

**Out (defer to v2/v3):** WebRTC/SFU live proctoring, AI transcript/summary/signals, SAML/SCIM, legal hold/object-lock, multi-region, custom domains, OpenSearch, ATS connectors, advanced policy engine, clip/evidence-bundle export (basic original download only in MVP), cold-archive tiering.

---

## 14. Implementation phases

- **Phase 1 — MVP:** data model + Postgres migrations; `ObjectStore` driver (S3 + MinIO); template/session/token APIs; participant preflight + capture client (screen/webcam/mic, full-desktop check); segmenter + OPFS buffer; presigned multipart upload + ledger; finalize/verify; reviewer player (synced, PiP, event timeline) + annotations; OIDC + basic RBAC; Compose stack + MinIO; webhooks for completed.
- **Phase 2 — Production hardening:** resumable-upload edge cases + crash recovery; integrity/tamper-evidence; retention classes + lifecycle/sweeper; external queue (NATS); transcode/thumbnail workers + HLS manifests; observability (OTel/Prom/Grafana); Helm chart; backup/restore + integrity reconciler; quotas + storage accounting; customer-managed bucket mode; R2 + Garage drivers.
- **Phase 3 — Collaboration & AI review:** transcripts, summaries, highlights, event correlation, suspicious-behavior signals, scoring assist; clip export + evidence bundles; OpenSearch for transcript/event search; richer review collaboration (multi-reviewer, comments).
- **Phase 4 — Ops maturity (no enterprise):** migration tooling (storage backend moves), billing/metering hooks, ATS/HRIS connectors, autoscaling worker tuning, advanced retention/archival, backup/restore tooling.

> **Scope note (current build):** SaaS, deploy-anywhere (Docker Compose first → Helm parity, identical images). Multi-tenant + OIDC. Enterprise scope (SAML/SCIM, legal hold/object-lock, audit export, multi-region) **dropped**. Postgres-only core (Postgres-backed queue), Redis/NATS optional at scale. Bundled MinIO + BYO S3. Realtime via Postgres LISTEN/NOTIFY. **One app, route-gated**: `/admin/*` (session-auth) + `/take/*` (token-gated). Admin **Session Builder** authors a linear, forward-only step flow (consent → preflight → task… → finish) with configurable **recording-start** and **timer-start** anchors and a single **total timer**. Steps are capture-only (no response fields). Admin issues a session with **participant name+email** (labels only, no identity check); link is **token-gated**, TTL configurable (default 7d), consume point + max-uses admin-configurable.

---

## 15. Risks and hard problems

- **Browser permission limits:** no guaranteed full-desktop enforcement across all browsers/OS; `displaySurface` detection helps but UX coaching + re-prompt loops required; some browsers/permissions differ.
- **Full-desktop vs tab/window detection:** rely on `track.getSettings().displaySurface === 'monitor'`; not 100% uniform — must handle unknown/unsupported gracefully and document supported browsers.
- **Long-session recording stability:** memory growth, MediaRecorder quirks, OS sleep/throttling; mitigate with segmented capture, periodic flush, heartbeats, in-session upload.
- **Upload failures:** flaky networks; mitigated by resumable multipart + local buffer + server ledger; still bounded last-segment loss on hard crash.
- **Privacy expectations:** recording desktops is sensitive; mandatory consent, clear notices, redaction options, customer-managed buckets.
- **Compliance:** GDPR/CCPA, consent, retention, deletion, residency, legal hold — needs first-class controls (mostly enterprise).
- **Playback sync:** multi-track drift; solved via single session clock + offset-stamped segments/events.
- **Storage cost growth:** media dominates cost; lifecycle/cold-archive/retention from day one; per-tenant accounting.
- **Self-hosting support burden:** many storage/IdP/queue combos; reduce via capability flags, sane defaults (Postgres queue, MinIO, built-in auth), strong docs, single image.

---

## 16. Opinionated recommendations

- **Best product scope:** ship a *recorded-session capture+review* platform, not an interview tool. Build the rules-engine + preflight + storage loop generically; interviews are config.
- **Best initial architecture:** **Go backend (single binary) + React/TS frontend + Postgres + Postgres-backed queue + S3 `ObjectStore` driver**, direct-to-storage presigned multipart, MediaRecorder capture. No SFU, no Kafka, no microservice sprawl in v1.
- **Best MVP slice:** preflight-gated capture (camera + full-desktop + optional mic + timer) → resumable direct-to-MinIO upload → integrity-verified finalize → synced reviewer playback + annotations → Compose self-host. Nothing else.
- **Best storage design:** one S3-compatible `ObjectStore` interface; bucket-per-tenant in SaaS, prefix in small self-host; content-addressed segments; DB ledger as source of truth; lifecycle/retention + sweeper fallback; **customer-managed bucket mode** as the flagship trust feature.
- **Best self-hosting approach:** single Docker image, `docker compose up` with bundled MinIO+Postgres, env-config, capability-flag degradation, Helm for scale — same image both modes.
- **Best first market/use case:** **technical interviews & proctored take-home assessments** for privacy-sensitive orgs (regulated, security-conscious, EU) that refuse to send candidate recordings to vendor clouds — the wedge where "self-host + your own bucket" is a must-have, then expand to compliance/audit and onboarding.


