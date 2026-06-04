import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({ connectionString: config.db.url, max: 10 });

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: any[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
