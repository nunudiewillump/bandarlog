import { PGlite } from '@electric-sql/pglite';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { drizzle as remoteDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as localMigrate } from 'drizzle-orm/pglite/migrator';
import { migrate as remoteMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { queryLogger, measuredClient } from './metrics.js';
import * as schema from './schema.js';
import { scopedPglite, scopedPool } from './group-context.js';
import { mkdir } from 'node:fs/promises';
export async function connect() {
  if (process.env.DATABASE_URL) {
    const pool = measuredClient(new pg.Pool({ connectionString: process.env.DATABASE_URL }));
    const db = remoteDrizzle(pool, { schema, logger: queryLogger });
    await remoteMigrate(db, { migrationsFolder: 'migrations' });
    const scoped = remoteDrizzle(scopedPool(pool) as pg.Pool, { schema, logger: queryLogger });
    return { db: scoped, ownerDb: db, close: () => pool.end() };
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL es obligatorio en producción');
  const path = process.env.DATA_DIR || '.data';
  await mkdir(path, { recursive: true });
  const client = measuredClient(new PGlite(`${path}/db`));
  const db = localDrizzle(client, { schema, logger: queryLogger });
  await localMigrate(db, { migrationsFolder: 'migrations' });
  const scoped = localDrizzle(scopedPglite(client) as PGlite, { schema, logger: queryLogger });
  return { db: scoped, ownerDb: db, close: () => client.close() };
}
export type Database = Awaited<ReturnType<typeof connect>>['db'];
