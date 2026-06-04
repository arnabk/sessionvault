// Dev auth stub. In dev mode every admin request resolves to a single seeded
// org/user/project. Real OIDC + sessions land in a later phase (SPEC §8, ADR-0004).

import type { FastifyRequest } from 'fastify';
import { query } from './db/pool.js';
import { config } from './config.js';

export interface AuthContext {
  userId: string;
  orgId: string;
  projectId: string;
  email: string;
  role: string;
}

let cached: AuthContext | null = null;

export async function ensureSeed(): Promise<AuthContext> {
  if (cached) return cached;
  const org = await query(
    `INSERT INTO orgs(name) SELECT $1
       WHERE NOT EXISTS (SELECT 1 FROM orgs WHERE name = $1)
     RETURNING id`,
    [config.auth.devOrgName],
  );
  const orgId =
    org.rows[0]?.id ??
    (await query('SELECT id FROM orgs WHERE name = $1', [config.auth.devOrgName])).rows[0].id;

  const usr = await query(
    `INSERT INTO users(org_id, email, name, role) SELECT $1,$2,$3,'owner'
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE org_id=$1 AND email=$2)
     RETURNING id`,
    [orgId, config.auth.devUserEmail, 'Dev Admin'],
  );
  const userId =
    usr.rows[0]?.id ??
    (await query('SELECT id FROM users WHERE org_id=$1 AND email=$2', [
      orgId,
      config.auth.devUserEmail,
    ])).rows[0].id;

  const proj = await query(
    `INSERT INTO projects(org_id, name) SELECT $1,'Default Project'
       WHERE NOT EXISTS (SELECT 1 FROM projects WHERE org_id=$1 AND name='Default Project')
     RETURNING id`,
    [orgId],
  );
  const projectId =
    proj.rows[0]?.id ??
    (await query("SELECT id FROM projects WHERE org_id=$1 AND name='Default Project'", [orgId]))
      .rows[0].id;

  cached = { userId, orgId, projectId, email: config.auth.devUserEmail, role: 'owner' };
  return cached;
}

export async function requireAuth(_req: FastifyRequest): Promise<AuthContext> {
  if (config.auth.devMode) return ensureSeed();
  throw new Error('OIDC not yet implemented');
}
