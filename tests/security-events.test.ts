import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { securityEvents } from '../server/security-events';

test('security events correlate denials without disclosing URLs, identifiers, credentials or payloads', () => {
  const events: unknown[] = [];
  function run(path: string, statusCode: number) {
    const q: any = {
      path,
      originalUrl: path + '?token=SECRET',
      body: { code: 'SECRET' },
      headers: { cookie: 'SECRET' },
    };
    const r: any = Object.assign(new EventEmitter(), {
      statusCode,
      locals: { user: { id: 'private-user', email: 'private@example.test' } },
    });
    let continued = false;
    securityEvents((e) => events.push(e))(q, r, () => {
      continued = true;
    });
    assert.ok(continued);
    r.emit('finish');
  }
  const group = 'a'.repeat(32);
  run('/g/' + group + '/api/auth/google/return', 200);
  run('/g/' + group + '/api/tasks/SECRET', 403);
  run('/g/' + group + '/api/data', 200);
  run('/g/' + group + '/api/auth/passkeys/recovery/verify', 400);
  assert.equal(events.length, 3);
  const output = JSON.stringify(events);
  for (const sensitive of [
    'SECRET',
    group,
    'private-user',
    'private@example.test',
    'cookie',
    'originalUrl',
  ])
    assert.ok(!output.includes(sensitive));
  assert.deepEqual(
    events.map((e: any) => [e.operation, e.result]),
    [
      ['primary', 'accepted'],
      ['private', 'rejected'],
      ['recovery', 'rejected'],
    ],
  );
});
