// Centralised, env-driven configuration. Same schema is consumed identically
// by Docker Compose and Kubernetes/Helm (see docs/operations/config-reference.md).

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer for ${key}: ${v}`);
  return n;
}

export const config = {
  env: env('NODE_ENV', 'development'),
  host: env('HOST', '0.0.0.0'),
  port: envInt('PORT', 8080),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:8080'),

  // Path to the built SPA (apps/web/dist). When present, the API serves it.
  webDist: env('WEB_DIST', ''),

  db: {
    url: env('DATABASE_URL', 'postgres://sessionvault:sessionvault@localhost:5433/sessionvault'),
  },

  // S3-compatible object storage (MinIO by default for local/dev).
  storage: {
    endpoint: env('S3_ENDPOINT', 'http://localhost:9000'),
    region: env('S3_REGION', 'us-east-1'),
    accessKeyId: env('S3_ACCESS_KEY_ID', 'minioadmin'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY', 'minioadmin'),
    bucket: env('S3_BUCKET', 'sessionvault'),
    // MinIO/Garage require path-style addressing.
    forcePathStyle: env('S3_FORCE_PATH_STYLE', 'true') === 'true',
    // URL the *browser* uses to reach storage for presigned PUT/GET. In dev this
    // differs from the in-cluster endpoint (browser talks to localhost:9000).
    publicEndpoint: env('S3_PUBLIC_ENDPOINT', env('S3_ENDPOINT', 'http://localhost:9000')),
    presignTtlSeconds: envInt('S3_PRESIGN_TTL', 3600),
  },

  session: {
    // Default participant-link TTL (days) when admin does not override.
    defaultLinkTtlDays: envInt('SESSION_LINK_TTL_DAYS', 7),
  },

  // Username/password auth. A default admin is seeded on first run.
  auth: {
    orgName: env('AUTH_ORG_NAME', 'Demo Org'),
    defaultAdminUsername: env('AUTH_DEFAULT_ADMIN_USERNAME', 'admin'),
    defaultAdminPassword: env('AUTH_DEFAULT_ADMIN_PASSWORD', 'admin'),
    cookieName: env('AUTH_COOKIE_NAME', 'sv_session'),
    cookieSecure: env('AUTH_COOKIE_SECURE', 'false') === 'true',
    sessionTtlDays: envInt('AUTH_SESSION_TTL_DAYS', 14),
  },
} as const;

export type Config = typeof config;
