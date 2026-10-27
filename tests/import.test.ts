import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from '../server/db';
import { importBundle } from '../server/import';
import { users } from '../server/schema';
test('import dry run does not write; apply is idempotent; changed source reports conflict', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bandarlog-import-'));
  process.env.DATA_DIR = dir;
  process.env.DATABASE_URL = '';
  process.env.NODE_ENV = 'test';
  const { db, close } = await connect();
  try {
    const bundle = {
      users: [{ id: 'u1', name: 'Persona de prueba', email: 'qa@example.test', role: 'member' }],
      projects: [
        {
          id: 'r1',
          name: 'Ronda importada',
          type: 'ronda',
          starts: '2026-09-01',
          ends: '2027-08-31',
        },
      ],
      commissions: [{ id: 'c1', projectId: 'r1', name: 'Material' }],
      members: [{ commissionId: 'c1', userId: 'u1', role: 'coordinator' }],
      tasks: [
        {
          id: 't1',
          commissionId: 'c1',
          title: 'Revisar lista',
          due: '2027-05-02T12:00:00+02:00',
          status: 'pending',
          responsibleIds: ['u1'],
        },
      ],
    };
    const preview: any = await importBundle(db, bundle);
    assert.equal(preview.ok, true);
    assert.equal((await db.select().from(users)).length, 0);
    const applied: any = await importBundle(db, bundle, true);
    assert.equal(applied.applied, true);
    const repeated: any = await importBundle(db, bundle, true);
    assert.equal(repeated.created.tasks, 0);
    const conflict: any = await importBundle(
      db,
      { ...bundle, users: [{ ...bundle.users[0], name: 'Otro nombre' }] },
      true,
    );
    assert.equal(conflict.ok, false);
    assert.equal((await db.select().from(users))[0].name, 'Persona de prueba');
    const missing: any = await importBundle(db, {
      ...bundle,
      tasks: [{ ...bundle.tasks[0], responsibleIds: ['unknown'] }],
    });
    assert.equal(missing.ok, false);
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});
