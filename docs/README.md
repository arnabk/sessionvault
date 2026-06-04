# SessionVault Documentation

Single source of truth. The root [`README.md`](../README.md) only points here.
The full design rationale lives in [`SPEC.md`](../SPEC.md) (16-section product & architecture spec).

## Index

- **Product**
  - [Product & architecture spec (SPEC.md)](../SPEC.md)
  - [Glossary](./glossary.md)
- **Architecture**
  - [Overview](./architecture/overview.md)
  - [Backend modules](./architecture/backend.md)
  - [Frontend modules (Admin + Taker)](./architecture/frontend.md)
  - [Recording & upload pipeline](./architecture/recording.md)
  - [Storage architecture](./architecture/storage.md)
  - [Realtime coordination](./architecture/realtime.md)
- **Data**
  - [Data model](./data/data-model.md)
  - [Entity-relationship diagram](./data/erd.md)
- **API**
  - [REST API reference](./api/rest-api.md)
  - [Webhooks](./api/webhooks.md)
- **Guides**
  - [Local development](./guides/local-dev.md)
  - [Authoring a session (Session Builder)](./guides/session-builder.md)
  - [Participant (Taker) flow](./guides/taker-flow.md)
  - [Configuring storage backends](./guides/storage-config.md)
- **Operations**
  - [Deployment (Docker Compose & Kubernetes/Helm)](./operations/deployment.md)
  - [Configuration reference](./operations/config-reference.md)
  - [Backup & restore](./operations/backup-restore.md)
  - [Scaling](./operations/scaling.md)
- **Testing**
  - [Strategy](./testing/strategy.md)
- **Governance**
  - [Contributing](../CONTRIBUTING.md)
  - [Code of Conduct](../CODE_OF_CONDUCT.md)
  - [Security policy](../SECURITY.md)
- **ADRs (Architecture Decision Records)**
  - [ADR-0001 — Deploy-anywhere, identical images (Docker + K8s)](./adr/0001-deploy-anywhere.md)
  - [ADR-0002 — Postgres-only core, queue & realtime](./adr/0002-postgres-only-core.md)
  - [ADR-0003 — S3-compatible ObjectStore abstraction](./adr/0003-s3-objectstore.md)
  - [ADR-0004 — One app, route-gated Admin + Taker](./adr/0004-route-gated-apps.md)
  - [ADR-0005 — Browser MediaRecorder + direct-to-storage upload](./adr/0005-recording-model.md)
  - [ADR-0006 — Token-gated participant links](./adr/0006-token-model.md)

## Documentation conventions

- One topic per file; keep files focused and link rather than duplicate.
- Decisions go in an **ADR**; designs go in **architecture**; how-to goes in **guides**;
  run-it-in-prod goes in **operations**.
- `SPEC.md` is the canonical scope/decision record; docs expand on it, never contradict it.
