# Deployment

SessionVault ships as a single application image that serves both the API and the
web UI. The recommended way to run it is **Docker Compose with the bundled Caddy
reverse proxy**, which provides **automatic HTTPS**.

- [Quick start (local, self-signed HTTPS)](#quick-start-local)
- [Public hosting with a real domain (Let's Encrypt)](#public-hosting)
- [Configuration reference](#configuration)
- [Using external S3 / Cloudflare R2](#external-storage)
- [Operations](#operations)
- [Local development (no HTTPS)](#local-development)

The Compose stack contains four services:

| Service    | Purpose                                                        |
|------------|---------------------------------------------------------------|
| `caddy`    | Reverse proxy + **automatic TLS** (Let's Encrypt or self-signed) |
| `api`      | SessionVault backend; also serves the built web UI            |
| `postgres` | Metadata database                                             |
| `minio`    | Bundled S3-compatible object storage (optional — see below)   |

---

## Quick start (local) {#quick-start-local}

```bash
git clone https://github.com/arnabk/sessionvault.git
cd sessionvault
cp .env.example .env          # defaults are fine for localhost
docker compose up -d --build
```

Then open:

- **Admin:** https://localhost/admin  (default login `admin` / `admin`)
- **Participant link:** https://localhost/take/<token>

Because `SV_DOMAIN=localhost`, Caddy issues a **locally-trusted self-signed
certificate**. Your browser may warn on first visit — that's expected for
localhost. **Change the admin password** after first login (a banner reminds you).

---

## Public hosting with a real domain {#public-hosting}

To host SessionVault on a public machine with a trusted certificate:

1. **Point DNS at the host.** Create an `A` (and/or `AAAA`) record for your
   domain, e.g. `sessions.example.com`, pointing at the server's public IP.

2. **Open ports 80 and 443.** Caddy needs both reachable from the internet to
   complete the Let's Encrypt HTTP-01 challenge and to serve traffic.

3. **Configure `.env`:**

   ```ini
   SV_DOMAIN=sessions.example.com
   SV_TLS_EMAIL=you@example.com         # optional but recommended
   PUBLIC_BASE_URL=https://sessions.example.com
   AUTH_COOKIE_SECURE=true
   AUTH_DEFAULT_ADMIN_PASSWORD=<a-strong-password>
   POSTGRES_PASSWORD=<a-strong-password>
   S3_SECRET_ACCESS_KEY=<a-strong-secret>
   ```

   To enable Let's Encrypt expiry emails, uncomment the global block in
   `deploy/compose/Caddyfile`:

   ```
   { email {$SV_TLS_EMAIL} }
   ```

4. **Start:**

   ```bash
   docker compose up -d --build
   ```

   Caddy automatically obtains and renews a **Let's Encrypt certificate** for
   your domain. HTTP is redirected to HTTPS. No manual cert management required.

> **Behind another proxy / load balancer?** If TLS is terminated upstream, you
> can drop the `caddy` service and route directly to `api:8080`, setting
> `AUTH_COOKIE_SECURE=true` and the correct `PUBLIC_BASE_URL`.

---

## Configuration {#configuration}

All configuration is environment-driven (see `.env.example`). Key variables:

| Variable                      | Default                | Notes |
|-------------------------------|------------------------|-------|
| `SV_DOMAIN`                   | `localhost`            | Domain for TLS. Real domain → Let's Encrypt; `localhost` → self-signed. |
| `SV_TLS_EMAIL`                | _(empty)_              | Let's Encrypt contact (optional). |
| `PUBLIC_BASE_URL`             | `https://localhost`    | Base URL used to build participant links. Must match your domain. |
| `POSTGRES_PASSWORD`           | `sessionvault`         | **Change in production.** |
| `S3_ENDPOINT`                 | `http://minio:9000`    | Storage endpoint the **server** uses. Browsers never touch storage. |
| `S3_ACCESS_KEY_ID`            | `minioadmin`           | Storage access key. |
| `S3_SECRET_ACCESS_KEY`        | `minioadmin`           | **Change in production.** |
| `S3_BUCKET`                   | `sessionvault`         | Bucket name (created automatically on MinIO). |
| `S3_FORCE_PATH_STYLE`         | `true`                 | `true` for MinIO/Garage; `false` for AWS S3 / R2. |
| `AUTH_DEFAULT_ADMIN_USERNAME` | `admin`                | Seeded on first run. |
| `AUTH_DEFAULT_ADMIN_PASSWORD` | `admin`                | **Set a strong value before first boot**, or change it after login. |
| `AUTH_COOKIE_SECURE`          | `true`                 | Send session cookie only over HTTPS. Keep `true` in production. |
| `AUTH_SESSION_TTL_DAYS`       | `14`                   | Login session lifetime. |
| `SESSION_LINK_TTL_DAYS`       | `7`                    | Default participant-link expiry. |
| `SV_HTTP_PORT`                | `80`                   | Host port mapped to Caddy's HTTP listener (ACME + redirect). |
| `SV_HTTPS_PORT`               | `443`                  | Host port for HTTPS. Set to e.g. `8443` to serve on a custom port. |
| `SV_HTTPS_SITE`               | _(empty)_              | Override the site address, e.g. `sessions.example.com:8443`. |

### Serving HTTPS on a non-standard port

You can serve HTTPS on any port (e.g. `https://sessions.example.com:8443`):

```ini
SV_HTTPS_PORT=8443
SV_HTTPS_SITE=sessions.example.com:8443
PUBLIC_BASE_URL=https://sessions.example.com:8443
```

**Certificate caveat:** obtaining a Let's Encrypt cert still needs a reachable
challenge endpoint:

- **HTTP-01 (default)** requires **port 80** open to the internet (keep
  `SV_HTTP_PORT=80`). The cert is then used on whatever HTTPS port you choose.
- If port 80 is unavailable, use **DNS-01** (no inbound ports — proves ownership
  via a DNS TXT record) by adding a global `acme_dns` block to the `Caddyfile`
  with your DNS provider plugin, or **TLS-ALPN-01** (port 443 only).

---

## Using external S3 / Cloudflare R2 {#external-storage}

The bundled MinIO is convenient but optional. To use a managed S3-compatible
backend instead:

1. Remove (or don't start) the `minio` service.
2. Point the storage variables at your provider, for example **Cloudflare R2**:

   ```ini
   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   S3_ACCESS_KEY_ID=<key>
   S3_SECRET_ACCESS_KEY=<secret>
   S3_BUCKET=sessionvault
   S3_FORCE_PATH_STYLE=false
   ```

> **Switching vendor is server-only.** Because all media is proxied through the
> API (below), you change **just these `S3_*` variables** to move between MinIO,
> AWS S3, Cloudflare R2, Garage, etc. No frontend changes, no CORS, no public
> storage endpoint.

### How media transfers work (server-proxied)

> SessionVault **proxies all media through the API**. The participant's browser
> uploads each recording segment to the SessionVault API, and the API writes it
> to object storage. Reviewers stream recordings back through the API. **The
> browser never talks to storage directly.**
>
> Benefits: the storage vendor is fully decoupled from the frontend, there is no
> CORS to configure, no public storage endpoint to expose, and credentials never
> leave the server. Tradeoff: media bytes transit the API, so for very high
> volume you'll want multiple API replicas (see [Scaling](./scaling.md)).

Any S3 v4-signature endpoint works (AWS S3, R2, MinIO, Garage, …). See
[`docs/architecture/storage.md`](../architecture/storage.md).

---

## Operations {#operations}

**Logs**

```bash
docker compose logs -f api
docker compose logs -f caddy   # TLS / proxy
```

**Update to a new version**

```bash
git pull
docker compose up -d --build   # DB migrations run automatically on API boot
```

**Backup**

- Database: `docker compose exec postgres pg_dump -U sessionvault sessionvault > backup.sql`
- Object storage: back up the `miniodata` volume (or rely on your external
  bucket's versioning/replication).

**Restore**

```bash
cat backup.sql | docker compose exec -T postgres psql -U sessionvault sessionvault
```

**Stop / remove**

```bash
docker compose down            # keep data
docker compose down -v         # also delete volumes (DANGER: wipes data)
```

---

## Local development (no HTTPS) {#local-development}

For day-to-day development, run only Postgres + MinIO in Docker and run the API
and web with hot reload on the host:

```bash
docker compose -f deploy/compose/docker-compose.dev.yml up -d
# API:  cd services/api && pnpm dev
# web:  cd apps/web && pnpm dev   (proxies /api to the API)
```

See [`docs/guides/local-dev.md`](../guides/local-dev.md).
