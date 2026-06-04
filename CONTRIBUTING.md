# Contributing to SessionVault

Thanks for your interest. This document covers how to get set up, the conventions we follow,
and how to propose changes.

## Getting started

1. Read the [documentation index](docs/README.md) and the [spec](SPEC.md).
2. Set up a local environment — see [Local development](docs/guides/local-dev.md).
3. Pick an issue or open one to discuss your change before large work.

## Repository layout

```
sessionvault/
├── SPEC.md                  # Canonical product & architecture spec
├── README.md                # Points to docs
├── docs/                    # All documentation (source of truth)
├── apps/
│   └── web/                 # Frontend SPA (Admin + Taker, route-gated)
├── services/
│   ├── api/                 # Go backend: REST, auth, presign, finalize
│   ├── realtime/            # WebSocket coordination (Postgres LISTEN/NOTIFY)
│   └── worker/              # Queue consumer: transcode, sweep, webhooks
├── deploy/
│   ├── compose/             # Docker Compose stack
│   └── helm/                # Helm chart for Kubernetes
├── migrations/              # Forward-only SQL migrations
└── scripts/                 # Dev/ops helper scripts
```

## Branching & commits

- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`.
- Keep PRs focused and small. Reference the issue.

## Decisions

Architectural decisions are recorded as **ADRs** in [`docs/adr/`](docs/adr/). If your change
alters an architectural decision, add or supersede an ADR in the same PR.

## Code style

- **Go** (`services/`): `gofmt`/`goimports`, `go vet`, `golangci-lint`. Errors wrapped with context.
- **TypeScript/React** (`apps/web`): ESLint + Prettier. Strict TS. Taker bundle kept dependency-light.
- **SQL** (`migrations/`): forward-only, idempotent where possible, one logical change per file.

## Tests

See the [testing strategy](docs/testing/strategy.md). New behavior must ship with tests.
Run the full suite before opening a PR.

## Reporting security issues

Do **not** open public issues for vulnerabilities. Follow the [security policy](SECURITY.md).
