import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { observePoolErrors } from '../server/pool-errors';
test('idle pool disconnects are handled without logging error/client credentials', () => {
  const entries: unknown[] = [];
  const pool = observePoolErrors(new EventEmitter(), (e) => entries.push(e));
  pool.emit('error', {
    code: '57P01',
    message: 'secret-password',
    client: { connectionParameters: { password: 'secret-password' } },
  });
  pool.emit('error', { code: 'secret-password\ninjected', message: 'private SQL' });
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((e: any) => e.code),
    ['57P01', 'CONNECTION_ERROR'],
  );
  assert.ok(entries.every((e: any) => /^\d{4}-.*Z$/.test(e.at)));
  const output = JSON.stringify(entries);
  assert.ok(
    !output.includes('secret-password') &&
      !output.includes('private SQL') &&
      !output.includes('connectionParameters'),
  );
});
