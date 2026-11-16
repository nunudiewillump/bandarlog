import { configureGroupSigning } from '../../server/group-context';
export const TEST_CONTEXT_SECRET = '42'.repeat(32); // Public test fixture, never a production secret.
export async function provisionTestContext(client: any) {
  configureGroupSigning(TEST_CONTEXT_SECRET);
  process.env.GROUP_CONTEXT_SECRET = TEST_CONTEXT_SECRET;
  await client.query(
    'insert into bandarlog_api.context_key(id,secret) values(true,$1) on conflict(id) do update set secret=excluded.secret',
    [TEST_CONTEXT_SECRET],
  );
}
