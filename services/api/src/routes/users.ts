import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, hashPassword } from '../auth.js';

export async function userRoutes(app: FastifyInstance) {
  // Any signed-in user can see the team roster.
  app.get('/api/users', async (req, reply) => {
    const auth = await requireAuth(req);
    const r = await query(
      `SELECT id, username, name, role, created_at
         FROM users WHERE org_id=$1 ORDER BY created_at`,
      [auth.orgId],
    );
    return { users: r.rows };
  });

  // Any signed-in user can create members or admins (username + password).
  app.post('/api/users', async (req, reply) => {
    const auth = await requireAuth(req);
    const body = z
      .object({
        username: z.string().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/),
        password: z.string().min(6),
        name: z.string().optional().default(''),
        role: z.enum(['admin', 'member']).default('member'),
      })
      .parse(req.body);

    const dup = await query('SELECT 1 FROM users WHERE org_id=$1 AND lower(username)=lower($2)', [
      auth.orgId,
      body.username,
    ]);
    if ((dup.rowCount ?? 0) > 0)
      return reply.code(409).send({ error: 'username_taken', message: 'That username is already taken.' });

    const r = await query(
      `INSERT INTO users(org_id, username, email, name, role, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, name, role, created_at`,
      [auth.orgId, body.username, `${body.username}@local`, body.name, body.role, hashPassword(body.password)],
    );
    return reply.code(201).send({ user: r.rows[0] });
  });

  // Any signed-in user can delete users — EXCEPT users with the 'admin' role.
  app.delete('/api/users/:id', async (req, reply) => {
    const auth = await requireAuth(req);
    const { id } = req.params as { id: string };
    if (id === auth.userId)
      return reply.code(400).send({ error: 'cannot_delete_self', message: 'You can’t delete your own account.' });
    const target = await query('SELECT role FROM users WHERE id=$1 AND org_id=$2', [id, auth.orgId]);
    if (target.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    if (target.rows[0].role === 'admin')
      return reply.code(403).send({ error: 'cannot_delete_admin', message: 'Admin users cannot be deleted.' });
    await query('DELETE FROM users WHERE id=$1 AND org_id=$2', [id, auth.orgId]);
    return { ok: true };
  });
}
