import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { ensureSeed } from './auth.js';
import { ensureBucket } from './storage/objectStore.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { templateRoutes } from './routes/templates.js';
import { sessionRoutes } from './routes/sessions.js';
import { takerRoutes } from './routes/taker.js';
import { uploadRoutes } from './routes/uploads.js';
import { brandingRoutes } from './routes/branding.js';

async function main() {
  // 64MB body limit so media segments can be proxied through the API.
  const app = Fastify({ logger: { level: 'info' }, bodyLimit: 64 * 1024 * 1024 });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  // Map thrown auth errors + Zod validation errors to clean responses.
  app.setErrorHandler((err: any, _req, reply) => {
    // Zod validation error (thrown by schema.parse) -> friendly field message.
    if (err?.name === 'ZodError' && Array.isArray(err.issues)) {
      const first = err.issues[0];
      const field = (first?.path ?? []).join('.') || 'input';
      const label = field.charAt(0).toUpperCase() + field.slice(1);
      let message = `${label} is invalid.`;
      if (first?.code === 'too_small') {
        message = first.type === 'string' && first.minimum === 1
          ? `${label} is required.`
          : `${label} must be at least ${first.minimum} character(s).`;
      } else if (first?.code === 'invalid_string') {
        message = `${label} has an invalid format.`;
      } else if (first?.code === 'invalid_type' && first?.received === 'undefined') {
        message = `${label} is required.`;
      } else if (first?.message) {
        message = first.message;
      }
      return reply.code(400).send({ error: 'validation_error', message, field });
    }

    const sc = err?.statusCode;
    if (sc === 401) return reply.code(401).send({ error: 'unauthorized' });
    if (sc === 403) return reply.code(403).send({ error: 'forbidden' });
    app.log.error(err);
    return reply.code(sc && sc >= 400 && sc < 500 ? sc : 500).send({ error: err?.message || 'internal_error' });
  });

  app.get('/api/health', async () => ({ status: 'ok', ts: Date.now() }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(templateRoutes);
  await app.register(sessionRoutes);
  await app.register(takerRoutes);
  await app.register(uploadRoutes);
  await app.register(brandingRoutes);

  // Serve built SPA if present; SPA-history fallback for /admin and /take routes.
  if (config.webDist) {
    const root = isAbsolute(config.webDist) ? config.webDist : join(process.cwd(), config.webDist);
    if (existsSync(root)) {
      await app.register(fastifyStatic, { root, prefix: '/' });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/api') || req.url.startsWith('/take-api')) {
          return reply.code(404).send({ error: 'not_found' });
        }
        return reply.sendFile('index.html');
      });
      app.log.info(`[web] serving SPA from ${root}`);
    } else {
      app.log.warn(`[web] WEB_DIST set but not found: ${root}`);
    }
  }

  // Bootstrap: migrate, seed, ensure bucket. Tolerate storage being slow to come up.
  await migrate();
  await ensureSeed();
  await ensureBucket().catch((e) => app.log.warn(`ensureBucket: ${e.message}`));

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`SessionVault API listening on ${config.host}:${config.port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
