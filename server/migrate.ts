import { connectMaintenance } from './maintenance-db.js';
import { sql } from 'drizzle-orm';
import { seed } from './seed.js';
// Never imported by the HTTP entry point. Credentials belong only to a one-off job.
const { ownerDb, close } = await connectMaintenance();
try {
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('bandarlog.group_id','rosales-702',true)`);
    await seed(tx);
  });
} finally {
  await close();
}
