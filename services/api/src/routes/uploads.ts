// Direct-to-storage upload presign for the Taker. Returns a presigned PUT URL
// the browser uploads each segment to (no media bytes proxied through the API).
// Multipart variants are defined in objectStore for large segments (SPEC §4.3).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { presignPut, segmentKey } from '../storage/objectStore.js';

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/take-api/:token/uploads/presign', async (req, reply) => {
    const { token } = req.params as { token: string };
    const t = await query(
      `SELECT s.id AS session_id, s.org_id, s.project_id, tok.expires_at, tok.consumed_at
         FROM session_tokens tok JOIN sessions s ON s.id = tok.session_id
        WHERE tok.token=$1`,
      [token],
    );
    if (t.rowCount === 0) return reply.code(410).send({ error: 'invalid' });
    const row = t.rows[0];
    if (row.consumed_at) return reply.code(410).send({ error: 'consumed' });
    if (new Date(row.expires_at).getTime() < Date.now())
      return reply.code(410).send({ error: 'expired' });

    const body = z
      .object({
        track: z.enum(['screen', 'webcam', 'mic', 'events']),
        seq: z.number().int().nonnegative(),
        ext: z.string().default('webm'),
      })
      .parse(req.body);

    const key = segmentKey(
      row.org_id,
      row.project_id,
      row.session_id,
      body.track,
      body.seq,
      body.ext,
    );
    const url = await presignPut(key);
    return { url, storage_key: key };
  });
}
