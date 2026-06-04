// Public, token-gated participant (Taker) routes. No session auth; the signed
// token is the capability. Cannot reach any /api/* admin route. (SPEC §2/§8, ADR-0006)

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';

interface TokenRow {
  token: string;
  session_id: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  consume_on: string;
  consumed_at: string | null;
}

async function resolveToken(token: string): Promise<{ ok: false; reason: string } | { ok: true; row: TokenRow; session: any }> {
  const t = await query<TokenRow>('SELECT * FROM session_tokens WHERE token=$1', [token]);
  if (t.rowCount === 0) return { ok: false, reason: 'invalid' };
  const row = t.rows[0];
  if (row.consumed_at) return { ok: false, reason: 'consumed' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.uses >= row.max_uses) return { ok: false, reason: 'max_uses' };
  const s = await query('SELECT * FROM sessions WHERE id=$1', [row.session_id]);
  if (s.rowCount === 0) return { ok: false, reason: 'invalid' };
  const session = s.rows[0];
  if (['complete', 'force_ended', 'expired'].includes(session.status)) {
    return { ok: false, reason: 'closed' };
  }
  return { ok: true, row, session };
}

export async function takerRoutes(app: FastifyInstance) {
  // Resolve a link -> flow snapshot for the Taker app to render.
  app.get('/take-api/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const r = await resolveToken(token);
    if (!r.ok) return reply.code(410).send({ error: r.reason });
    return {
      session_id: r.session.id,
      status: r.session.status,
      participant_name: r.session.participant_name,
      flow: r.session.flow_snapshot,
    };
  });

  // Mark session started (preflight passed); optionally consume-on-start.
  app.post('/take-api/:token/start', async (req, reply) => {
    const { token } = req.params as { token: string };
    const r = await resolveToken(token);
    if (!r.ok) return reply.code(410).send({ error: r.reason });
    await query(
      `UPDATE sessions SET status='recording', started_at=COALESCE(started_at, now()),
             recording_started_at=COALESCE(recording_started_at, now()),
             timer_started_at=COALESCE(timer_started_at, now())
         WHERE id=$1`,
      [r.session.id],
    );
    if (r.row.consume_on === 'start') {
      await query(
        `UPDATE session_tokens SET uses=uses+1,
               consumed_at = CASE WHEN uses+1 >= max_uses THEN now() ELSE consumed_at END
           WHERE token=$1`,
        [token],
      );
    }
    return { ok: true, session_id: r.session.id };
  });

  // Append a timeline event.
  app.post('/take-api/:token/events', async (req, reply) => {
    const { token } = req.params as { token: string };
    const r = await resolveToken(token);
    if (!r.ok) return reply.code(410).send({ error: r.reason });
    const body = z
      .object({ at_ms: z.number().int(), type: z.string(), data: z.record(z.any()).default({}) })
      .parse(req.body);
    await query(
      `INSERT INTO session_events(session_id, at_ms, type, data) VALUES ($1,$2,$3,$4)`,
      [r.session.id, body.at_ms, body.type, JSON.stringify(body.data)],
    );
    return { ok: true };
  });

  // Finalize: record manifest, verify segments present, set terminal status.
  app.post('/take-api/:token/finalize', async (req, reply) => {
    const { token } = req.params as { token: string };
    const r = await resolveToken(token);
    if (!r.ok) return reply.code(410).send({ error: r.reason });
    const body = z
      .object({
        end_reason: z.string().default('submit'),
        segments: z
          .array(
            z.object({
              track: z.string(),
              seq: z.number().int(),
              storage_key: z.string(),
              bytes: z.number().int().optional(),
              start_ms: z.number().int().optional(),
              duration_ms: z.number().int().optional(),
              sha256: z.string().optional(),
            }),
          )
          .default([]),
      })
      .parse(req.body);

    for (const seg of body.segments) {
      await query(
        `INSERT INTO segments(session_id, track, seq, storage_key, bytes, start_ms, duration_ms, sha256, uploaded)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
         ON CONFLICT (session_id, track, seq) DO UPDATE SET uploaded=true`,
        [
          r.session.id,
          seg.track,
          seg.seq,
          seg.storage_key,
          seg.bytes ?? null,
          seg.start_ms ?? null,
          seg.duration_ms ?? null,
          seg.sha256 ?? null,
        ],
      );
    }

    const status = body.segments.length > 0 ? 'complete' : 'incomplete';
    await query(
      `UPDATE sessions SET status=$2, ended_at=now(), end_reason=$3 WHERE id=$1`,
      [r.session.id, status, body.end_reason],
    );
    if (r.row.consume_on === 'complete') {
      await query(
        `UPDATE session_tokens SET uses=uses+1, consumed_at=now() WHERE token=$1`,
        [token],
      );
    }
    return { ok: true, status };
  });
}
