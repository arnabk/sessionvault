import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTx } from '../db/pool.js';
import { requireAuth } from '../auth.js';

const stepSchema = z.object({
  type: z.enum(['welcome', 'consent', 'preflight', 'task', 'finish']),
  title: z.string().default(''),
  body_md: z.string().default(''),
  required: z.boolean().default(true),
  config: z.record(z.any()).default({}),
});

const flowConfigSchema = z.object({
  recordingStart: z.string().default('after_preflight'), // after_preflight|on_consent_accept|on_step_enter|manual
  recordingStartStep: z.number().int().nullable().default(null),
  timerStart: z.string().default('on_recording_start'), // on_recording_start|on_first_task|on_step_enter|manual
  timerStartStep: z.number().int().nullable().default(null),
  timerMode: z.literal('total').default('total'),
  totalTimerSeconds: z.number().int().positive().default(1800),
  navigation: z.literal('linear').default('linear'),
  endTriggers: z.array(z.string()).default(['submit', 'timeout', 'permission_loss', 'force_end']),
});

const upsertSchema = z.object({
  name: z.string().min(1),
  flow_config: flowConfigSchema.default({}),
  steps: z.array(stepSchema).min(1),
});

export async function templateRoutes(app: FastifyInstance) {
  app.get('/api/templates', async (req) => {
    const auth = await requireAuth(req);
    const rows = await query(
      `SELECT t.*, (SELECT count(*) FROM template_steps s WHERE s.template_id=t.id) AS step_count
         FROM templates t WHERE t.org_id=$1 ORDER BY t.updated_at DESC`,
      [auth.orgId],
    );
    return { templates: rows.rows };
  });

  app.get('/api/templates/:id', async (req, reply) => {
    const auth = await requireAuth(req);
    const { id } = req.params as { id: string };
    const t = await query('SELECT * FROM templates WHERE id=$1 AND org_id=$2', [id, auth.orgId]);
    if (t.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    const steps = await query(
      'SELECT * FROM template_steps WHERE template_id=$1 ORDER BY ordinal',
      [id],
    );
    return { template: t.rows[0], steps: steps.rows };
  });

  app.post('/api/templates', async (req, reply) => {
    const auth = await requireAuth(req);
    const body = upsertSchema.parse(req.body);
    const out = await withTx(async (c) => {
      const t = await c.query(
        `INSERT INTO templates(org_id, project_id, name, flow_config, status)
         VALUES ($1,$2,$3,$4,'active') RETURNING *`,
        [auth.orgId, auth.projectId, body.name, JSON.stringify(body.flow_config)],
      );
      const tpl = t.rows[0];
      for (let i = 0; i < body.steps.length; i++) {
        const s = body.steps[i];
        await c.query(
          `INSERT INTO template_steps(template_id, ordinal, type, title, body_md, required, config)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tpl.id, i, s.type, s.title, s.body_md, s.required, JSON.stringify(s.config)],
        );
      }
      return tpl;
    });
    return reply.code(201).send({ template: out });
  });

  app.put('/api/templates/:id', async (req, reply) => {
    const auth = await requireAuth(req);
    const { id } = req.params as { id: string };
    const body = upsertSchema.parse(req.body);
    const owned = await query('SELECT id FROM templates WHERE id=$1 AND org_id=$2', [
      id,
      auth.orgId,
    ]);
    if (owned.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    const out = await withTx(async (c) => {
      const t = await c.query(
        `UPDATE templates SET name=$2, flow_config=$3, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, body.name, JSON.stringify(body.flow_config)],
      );
      await c.query('DELETE FROM template_steps WHERE template_id=$1', [id]);
      for (let i = 0; i < body.steps.length; i++) {
        const s = body.steps[i];
        await c.query(
          `INSERT INTO template_steps(template_id, ordinal, type, title, body_md, required, config)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, i, s.type, s.title, s.body_md, s.required, JSON.stringify(s.config)],
        );
      }
      return t.rows[0];
    });
    return { template: out };
  });
}
