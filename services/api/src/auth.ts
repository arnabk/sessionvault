// Username/password auth. Cookie-based opaque sessions. Roles: admin | member.
import type { FastifyRequest, FastifyReply } from 'fastify';
import { query } from './db/pool.js';
import { config } from './config.js';
import { hashPassword, verifyPassword, newToken } from './crypto.js';

export interface AuthContext {
  userId: string;
  orgId: string;
  projectId: string;
  username: string;
  role: 'admin' | 'member';
}

// ----- one-time bootstrap: org, project, default admin -----
let orgId: string | null = null;
let projectId: string | null = null;

export async function ensureSeed(): Promise<{ orgId: string; projectId: string }> {
  if (orgId && projectId) return { orgId, projectId };

  const org = await query(
    `INSERT INTO orgs(name) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM orgs WHERE name=$1) RETURNING id`,
    [config.auth.orgName],
  );
  orgId = org.rows[0]?.id ?? (await query('SELECT id FROM orgs WHERE name=$1', [config.auth.orgName])).rows[0].id;

  const proj = await query(
    `INSERT INTO projects(org_id, name) SELECT $1,'Default Project'
       WHERE NOT EXISTS (SELECT 1 FROM projects WHERE org_id=$1 AND name='Default Project') RETURNING id`,
    [orgId],
  );
  projectId =
    proj.rows[0]?.id ??
    (await query("SELECT id FROM projects WHERE org_id=$1 AND name='Default Project'", [orgId])).rows[0].id;

  // Seed the default admin if no usable admin (one with a password) exists yet.
  const usableAdmin = await query(
    "SELECT count(*)::int AS n FROM users WHERE org_id=$1 AND role='admin' AND password_hash IS NOT NULL",
    [orgId],
  );
  if (usableAdmin.rows[0].n === 0) {
    // Repair an existing passwordless admin (e.g. from an earlier dev seed) or insert one.
    const existing = await query(
      'SELECT id FROM users WHERE org_id=$1 AND lower(username)=lower($2)',
      [orgId, config.auth.defaultAdminUsername],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await query("UPDATE users SET role='admin', password_hash=$2 WHERE id=$1", [
        existing.rows[0].id,
        hashPassword(config.auth.defaultAdminPassword),
      ]);
    } else {
      await query(
        `INSERT INTO users(org_id, username, email, name, role, password_hash)
         VALUES ($1,$2,$3,'Administrator','admin',$4)`,
        [
          orgId,
          config.auth.defaultAdminUsername,
          `${config.auth.defaultAdminUsername}@local`,
          hashPassword(config.auth.defaultAdminPassword),
        ],
      );
    }
    console.log(`[auth] ensured default admin "${config.auth.defaultAdminUsername}"`);
  }
  return { orgId: orgId!, projectId: projectId! };
}

// ----- login / sessions -----
export async function login(username: string, password: string): Promise<string | null> {
  const { orgId } = await ensureSeed();
  const u = await query(
    'SELECT id, password_hash FROM users WHERE org_id=$1 AND lower(username)=lower($2)',
    [orgId, username],
  );
  if (u.rowCount === 0) return null;
  if (!verifyPassword(password, u.rows[0].password_hash)) return null;
  const token = newToken();
  await query(
    `INSERT INTO auth_sessions(token, user_id, expires_at)
     VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
    [token, u.rows[0].id, String(config.auth.sessionTtlDays)],
  );
  return token;
}

export async function logout(token: string): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE token=$1', [token]);
}

export async function resolveSession(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const r = await query(
    `SELECT u.id, u.username, u.role, u.org_id
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token=$1 AND s.expires_at > now()`,
    [token],
  );
  if (r.rowCount === 0) return null;
  const { projectId } = await ensureSeed();
  const row = r.rows[0];
  return { userId: row.id, orgId: row.org_id, projectId, username: row.username, role: row.role };
}

// ----- request guards -----
export async function requireAuth(req: FastifyRequest): Promise<AuthContext> {
  const token = (req as any).cookies?.[config.auth.cookieName];
  const ctx = await resolveSession(token);
  if (!ctx) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
  return ctx;
}

export async function requireAdmin(req: FastifyRequest): Promise<AuthContext> {
  const ctx = await requireAuth(req);
  if (ctx.role !== 'admin') throw Object.assign(new Error('forbidden'), { statusCode: 403 });
  return ctx;
}

// Whether the default admin still uses the default password (prompt to change).
export async function usingDefaultAdminPassword(): Promise<boolean> {
  const { orgId } = await ensureSeed();
  const u = await query(
    'SELECT password_hash FROM users WHERE org_id=$1 AND lower(username)=lower($2)',
    [orgId, config.auth.defaultAdminUsername],
  );
  if (u.rowCount === 0) return false;
  return verifyPassword(config.auth.defaultAdminPassword, u.rows[0].password_hash);
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.cookieSecure,
    path: '/',
    maxAge: config.auth.sessionTtlDays * 86400,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.auth.cookieName, { path: '/' });
}

export { hashPassword };
