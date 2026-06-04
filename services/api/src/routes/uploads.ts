// Server-proxied media transfer for the Taker. The browser uploads each segment
// to OUR API; the API writes it to storage. No direct browser-to-storage access,
// so switching storage vendors needs no frontend/CORS changes.

import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { putObject, segmentKey } from '../storage/objectStore.js';

const MAX_SEGMENT_BYTES = 64 * 1024 * 1024; // 64 MB per segment

async function tokenContext(token: string) {
  const t = await query(
    `SELECT s.id AS session_id, s.org_id, s.project_id, tok.expires_at, tok.consumed_at
       FROM session_tokens tok JOIN sessions s ON s.id = tok.session_id
      WHERE tok.token=$1`,
    [token],
  );
  if (t.rowCount === 0) return { ok: false as const, reason: 'invalid' };
  const row = t.rows[0];
  if (row.consumed_at) return { ok: false as const, reason: 'consumed' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, reason: 'expired' };
  return { ok: true as const, row };
}

export async function uploadRoutes(app: FastifyInstance) {
  // Accept raw binary segment bodies (no JSON parsing) up to the size limit.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: MAX_SEGMENT_BYTES },
    (_req, body, done) => done(null, body),
  );

  // Upload one segment. track/seq/ext come from the query string; body is binary.
  app.post('/take-api/:token/uploads', async (req, reply) => {
    const { token } = req.params as { token: string };
    const ctx = await tokenContext(token);
    if (!ctx.ok) return reply.code(410).send({ error: ctx.reason });

    const q = req.query as { track?: string; seq?: string; ext?: string };
    const track = q.track ?? '';
    const seq = parseInt(q.seq ?? '', 10);
    const ext = (q.ext ?? 'webm').replace(/[^a-z0-9]/gi, '') || 'webm';
    if (!['screen', 'webcam', 'mic', 'events'].includes(track) && !/^screen\d+$/.test(track)) {
      return reply.code(400).send({ error: 'invalid_track' });
    }
    if (Number.isNaN(seq) || seq < 0) return reply.code(400).send({ error: 'invalid_seq' });

    const buf = req.body as Buffer;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return reply.code(400).send({ error: 'empty_body' });
    }

    const key = segmentKey(ctx.row.org_id, ctx.row.project_id, ctx.row.session_id, track, seq, ext);
    await putObject(key, buf, 'video/webm');
    return { ok: true, storage_key: key, bytes: buf.length };
  });
}
