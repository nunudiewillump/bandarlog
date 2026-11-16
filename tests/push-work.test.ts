import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { scopedPglite } from '../server/group-context';
import { exercisePushWork } from './fixtures/push-work';
import { provisionTestContext } from './fixtures/group-signing';
import * as s from '../server/schema';

test('device deadlines respect backoff/leases, and a full deferred batch cannot starve new work', async () => {
  const client = new PGlite();
  const owner = drizzle(client, { schema: s });
  try {
    await migrate(owner, { migrationsFolder: 'migrations' });
    await provisionTestContext(client);
    await exercisePushWork(drizzle(scopedPglite(client) as PGlite, { schema: s }), owner);
  } finally {
    await client.close();
  }
});
