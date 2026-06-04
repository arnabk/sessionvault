// Org branding / customization. Admin reads+writes; taker reads (per session token).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth.js';

const DEFAULTS = {
  productName: 'SessionVault',
  brandColor: '#4f46e5',
  logoUrl: null as string | null,
  background: 'grid' as 'grid' | 'math' | 'plain',
  welcomeText: "You've been invited to a recorded session. Here's what to expect:",
  theme: 'light' as 'light' | 'dark',
};

const brandingSchema = z.object({
  productName: z.string().min(1).max(60).optional(),
  brandColor: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  logoUrl: z.string().url().nullable().optional(),
  background: z.enum(['grid', 'math', 'plain']).optional(),
  welcomeText: z.string().max(280).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

async function getBranding(orgId: string) {
  const r = await query('SELECT branding FROM org_settings WHERE org_id=$1', [orgId]);
  return { ...DEFAULTS, ...(r.rows[0]?.branding ?? {}) };
}

export async function brandingRoutes(app: FastifyInstance) {
  app.get('/api/branding', async (req) => {
    const auth = await requireAuth(req);
    return { branding: await getBranding(auth.orgId) };
  });

  app.put('/api/branding', async (req) => {
    const auth = await requireAuth(req);
    const patch = brandingSchema.parse(req.body);
    const current = await getBranding(auth.orgId);
    const merged = { ...current, ...patch };
    await query(
      `INSERT INTO org_settings(org_id, branding) VALUES ($1,$2)
         ON CONFLICT (org_id) DO UPDATE SET branding=$2, updated_at=now()`,
      [auth.orgId, JSON.stringify(merged)],
    );
    return { branding: merged };
  });

  // Public: taker resolves branding by token (no auth).
  app.get('/take-api/:token/branding', async (req, reply) => {
    const { token } = req.params as { token: string };
    const r = await query(
      `SELECT s.org_id FROM session_tokens t JOIN sessions s ON s.id=t.session_id WHERE t.token=$1`,
      [token],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'invalid' });
    return { branding: await getBranding(r.rows[0].org_id) };
  });
}
