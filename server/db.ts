import { PGlite } from '@electric-sql/pglite';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { drizzle as remoteDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as localMigrate } from 'drizzle-orm/pglite/migrator';
import { migrate as remoteMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';
import { mkdir } from 'node:fs/promises';
export async function connect() {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const db = remoteDrizzle(pool, { schema });
    await remoteMigrate(db, { migrationsFolder: 'migrations' });
    return { db, close: () => pool.end() };
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL es obligatorio en producción');
  const path = process.env.DATA_DIR || '.data';
  await mkdir(path, { recursive: true });
  const client = new PGlite(`${path}/db`);
  const db = localDrizzle(client, { schema });
  await localMigrate(db, { migrationsFolder: 'migrations' });
  return { db, close: () => client.close() };
}
export type Database = Awaited<ReturnType<typeof connect>>['db'];
