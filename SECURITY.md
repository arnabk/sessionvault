# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately**. Do not open a public GitHub issue.

- Email: `security@sessionvault.example` (replace with the project contact).
- Include: affected version/commit, reproduction steps, impact, and any PoC.

We aim to acknowledge within 72 hours and provide a remediation timeline after triage.

## Scope

SessionVault handles sensitive media (desktop/webcam/mic recordings) and PII (participant
name/email). Areas of particular interest:

- **Token-gated taker links** — bypass, replay, or privilege escalation from `/take/*` to `/admin/*`.
- **Presigned URL handling** — over-broad scope, long TTLs, key/credential leakage.
- **Tenant isolation** — cross-org data access via IDs, storage prefixes, or queries.
- **Upload integrity** — manifest/checksum bypass, tamper of stored segments.
- **Auth** — OIDC/session handling, RBAC enforcement.

## Supported versions

During pre-alpha, only `main` is supported. A version support matrix will be published at GA.

## Hardening defaults

- No public buckets; all object access via short-TTL, method- and key-scoped presigned URLs.
- TLS in transit; encryption at rest via SSE or app-layer envelope encryption.
- Taker routes cannot reach admin APIs; strict CSP on the taker bundle.
- Forward-only migrations; secrets injected via environment/secret stores, never committed.

See [`docs/architecture/storage.md`](docs/architecture/storage.md) and
[SPEC §8](SPEC.md#8-security-and-trust-model) for the full trust model.
