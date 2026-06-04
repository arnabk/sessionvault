# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial product & architecture specification (`SPEC.md`).
- Documentation set under `docs/` (architecture, data model, API, guides, operations, ADRs).
- Repository scaffolding for `apps/web`, `services/{api,realtime,worker}`, `deploy/{compose,helm}`.

### Scope (locked)
- SaaS, deploy-anywhere (Docker Compose first → Helm parity, identical images).
- Multi-tenant + OIDC. Enterprise scope intentionally out (no SAML/SCIM, legal hold, audit export, multi-region).
- Postgres-only core (Postgres-backed queue + LISTEN/NOTIFY realtime); Redis/NATS optional at scale.
- Bundled MinIO + BYO S3-compatible storage.
- One app, route-gated: `/admin/*` (session-auth) + `/take/*` (token-gated).
- Session Builder: linear forward-only steps, single total timer, configurable recording/timer anchors, capture-only steps.
- Token-gated participant links: name/email labels only (no identity check), configurable TTL (default 7d), consume point + max-uses.
