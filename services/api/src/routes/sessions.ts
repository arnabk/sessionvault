import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, withTx } from '../db/pool.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';

const issueSchema = z.object({
  template_id: z.string().uuid(),
  participant_name: z.string().optional().default(''),
  participant_email: z.string().email().optional().or(z.literal('')).default(''),
  link_ttl_days: z.number().int().positive().optional(),
  max_uses: z.number().int().positive().default(1),
  consume_on: z.enum(['start', 'complete']).default('complete'),
});

export async function sessionRoutes(app: FastifyInstance) {
  // ----- Admin: list -----
  app.get('/api/sessions', async (req) => {
    const auth = await requireAuth(req);
    const rows = await query(
      `SELECT s.*, t.name AS template_name,
              tok.token, tok.expires_at, tok.consumed_at, tok.uses, tok.max_uses
         FROM sessions s
         JOIN templates t ON t.id = s.template_id
         LEFT JOIN session_tokens tok ON tok.session_id = s.id
        WHERE s.org_id=$1 ORDER BY s.created_at DESC`,
      [auth.orgId],
    );
    return { sessions: rows.rows };
  });

  // ----- Admin: issue -----
  app.post('/api/sessions/issue', async (req, reply) => {
    const auth = await requireAuth(req);
    const body = issueSchema.parse(req.body);
    const tpl = await query(
      'SELECT * FROM templates WHERE id=$1 AND org_id=$2',
      [body.template_id, auth.orgId],
    );
    if (tpl.rowCount === 0) return reply.code(404).send({ error: 'template_not_found' });
    const steps = await query(
      'SELECT type, title, body_md, required, config, ordinal FROM template_steps WHERE template_id=$1 ORDER BY ordinal',
      [body.template_id],
    );
    const snapshot = { flow_config: tpl.rows[0].flow_config, steps: steps.rows };
    const ttlDays = body.link_ttl_days ?? config.session.defaultLinkTtlDays;
    const token = nanoid(32);

    const out = await withTx(async (c) => {
      const s = await c.query(
        `INSERT INTO sessions(org_id, project_id, template_id, flow_snapshot,
                              participant_name, participant_email, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'issued',$7) RETURNING *`,
        [
          auth.orgId,
          auth.projectId,
          body.template_id,
          JSON.stringify(snapshot),
          body.participant_name,
          body.participant_email,
          auth.userId,
        ],
      );
      const session = s.rows[0];
      await c.query(
        `INSERT INTO session_tokens(token, session_id, expires_at, max_uses, consume_on)
         VALUES ($1,$2, now() + ($3 || ' days')::interval, $4, $5)`,
        [token, session.id, String(ttlDays), body.max_uses, body.consume_on],
      );
      return session;
    });

    return reply.code(201).send({
      session: out,
      token,
      link: `${config.publicBaseUrl}/take/${token}`,
    });
  });

  // ----- Admin: get one (with events, artifacts, annotations) -----
  app.get('/api/sessions/:id', async (req, reply) => {
    const auth = await requireAuth(req);
    const { id } = req.params as { id: string };
    const s = await query('SELECT * FROM sessions WHERE id=$1 AND org_id=$2', [id, auth.orgId]);
    if (s.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    const events = await query(
      'SELECT * FROM session_events WHERE session_id=$1 ORDER BY at_ms',
      [id],
    );
    const artifacts = await query('SELECT * FROM artifacts WHERE session_id=$1', [id]);
    const annotations = await query(
      'SELECT * FROM annotations WHERE session_id=$1 ORDER BY at_ms',
      [id],
    );
    return {
      session: s.rows[0],
      events: events.rows,
      artifacts: artifacts.rows,
      annotations: annotations.rows,
    };
  });

  // ----- Admin: force-end -----
  app.post('/api/sessions/:id/force-end', async (req, reply) => {
    const auth = await requireAuth(req);
    const { id } = req.params as { id: string };
    const r = await query(
      `UPDATE sessions SET status='force_ended', ended_at=now(), end_reason='force_end'
         WHERE id=$1 AND org_id=$2 RETURNING *`,
      [id, auth.orgId],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    return { session: r.rows[0] };
  });

  // ----- Admin: annotations -----
  app.post('/api/sessions/:id/annotations', async (req, reply) => {
    const auth = await requireAuth(req);
    const { id } = req.params as { id: string };
    const body = z.object({ at_ms: z.number().int(), body: z.string().min(1) }).parse(req.body);
    const r = await query(
      `INSERT INTO annotations(session_id, author_id, at_ms, body) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, auth.userId, body.at_ms, body.body],
    );
    return reply.code(201).send({ annotation: r.rows[0] });
  });
}
