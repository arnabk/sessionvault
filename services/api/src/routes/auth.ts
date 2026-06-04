import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import {
  login,
  logout,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  usingDefaultAdminPassword,
  hashPassword,
} from '../auth.js';
import { verifyPassword } from '../crypto.js';
import { config } from '../config.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(req.body);
    const token = await login(body.username, body.password);
    if (!token) return reply.code(401).send({ error: 'invalid_credentials', message: 'Invalid username or password.' });
    setSessionCookie(reply, token);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = (req as any).cookies?.[config.auth.cookieName];
    if (token) await logout(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      return {
        user: { id: auth.userId, username: auth.username, role: auth.role },
        org_id: auth.orgId,
        project_id: auth.projectId,
        must_change_password: auth.role === 'admin' ? await usingDefaultAdminPassword() : false,
      };
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.post('/api/auth/change-password', async (req, reply) => {
    const auth = await requireAuth(req);
    const body = z
      .object({ current_password: z.string().min(1), new_password: z.string().min(6) })
      .parse(req.body);
    const u = await query('SELECT password_hash FROM users WHERE id=$1', [auth.userId]);
    if (!verifyPassword(body.current_password, u.rows[0]?.password_hash)) {
      return reply.code(400).send({ error: 'wrong_current_password', message: 'Current password is incorrect.' });
    }
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      auth.userId,
      hashPassword(body.new_password),
    ]);
    return { ok: true };
  });
}
