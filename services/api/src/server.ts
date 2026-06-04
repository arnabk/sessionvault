import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { ensureSeed } from './auth.js';
import { ensureBucket } from './storage/objectStore.js';
import { templateRoutes } from './routes/templates.js';
import { sessionRoutes } from './routes/sessions.js';
import { takerRoutes } from './routes/taker.js';
import { uploadRoutes } from './routes/uploads.js';
import { brandingRoutes } from './routes/branding.js';

async function main() {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({ status: 'ok', ts: Date.now() }));
  app.get('/api/me', async () => {
    const auth = await ensureSeed();
    return { user: { email: auth.email, role: auth.role }, org_id: auth.orgId, project_id: auth.projectId };
  });

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
