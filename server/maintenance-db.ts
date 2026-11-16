import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { drizzle as remoteDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as localMigrate } from 'drizzle-orm/pglite/migrator';
import { migrate as remoteMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { queryLogger } from './metrics.js';
import * as schema from './schema.js';
import { scopedPglite, scopedPool, configureGroupSigning } from './group-context.js';
import { mkdir } from 'node:fs/promises';
export async function connectMaintenance() {
  if (process.env.MIGRATION_DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
    const db = remoteDrizzle(pool, { schema, logger: queryLogger });
    await remoteMigrate(db, { migrationsFolder: 'migrations' });
    const key = (await pool.query('select secret from bandarlog_api.context_key where id')).rows[0]
      ?.secret;
    if (key) configureGroupSigning(key);
    const scoped = remoteDrizzle(scopedPool(pool) as pg.Pool, { schema, logger: queryLogger });
    return { db: scoped, ownerDb: db, close: () => pool.end() };
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('MIGRATION_DATABASE_URL es obligatorio en producción');
  const path = process.env.DATA_DIR || '.data';
  await mkdir(path, { recursive: true });
  const client = new PGlite(`${path}/db`);
  const db = localDrizzle(client, { schema, logger: queryLogger });
  await localMigrate(db, { migrationsFolder: 'migrations' });
  await client.query(
    'insert into bandarlog_api.context_key(id,secret) values(true,$1) on conflict(id) do nothing',
    [randomBytes(32).toString('hex')],
  );
  configureGroupSigning(
    (
      await client.query<{ secret: string }>(
        'select secret from bandarlog_api.context_key where id',
      )
    ).rows[0].secret,
  );
  await client.query("select set_config('bandarlog.group_id','rosales-702',false)");
  const scoped = localDrizzle(scopedPglite(client) as PGlite, { schema, logger: queryLogger });
  return { db: scoped, ownerDb: db, close: () => client.close() };
}
