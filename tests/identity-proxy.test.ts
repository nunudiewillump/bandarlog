import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { identityPath, identityProxy } from '../server/identity-proxy';

test('platform product routes cross the closed identity proxy', () => {
  const campaign = 'C-' + 'a'.repeat(32);
  const feedback = '5917fb55-ee3f-48e9-979c-5207dbf50868';
  for (const path of [
    'auth/config',
    'me',
    'feedback',
    'feedback/' + feedback,
    'campaigns/F03',
    'campaigns/' + campaign,
    'campaign-library',
    'campaign-library/' + campaign + '/1',
    'campaign-library/' + campaign + '/12/results',
    'insights/segments',
  ])
    assert.equal(identityPath('/api/platform/' + path), true, path);
  for (const path of [
    'feedback/other',
    'feedback/' + '-'.repeat(36),
    'feedback/' + feedback + '/other',
    'campaigns/F04',
    'campaign-library/' + campaign,
    'campaign-library/' + campaign + '/0',
    'campaign-library/' + campaign + '/1/edit',
    'insights',
    'insights/other',
  ])
    assert.equal(identityPath('/api/platform/' + path), false, path);
  assert.equal(identityPath('/api/product-feedback'), false);
  assert.equal(identityPath('/internal/wake'), false);
});

test('platform feedback receives the upstream response and preserves query, cookie and CSRF', async () => {
  const remote = express();
  remote.use(express.json());
  remote.get('/api/platform/feedback', (req, res) => {
    assert.equal(req.query.filter, 'new');
    res.status(401).json({ error: 'Sesión administrativa requerida.' });
  });
  const campaign = 'C-' + 'a'.repeat(32);
  remote.post('/api/platform/campaigns/' + campaign, (req, res) => {
    assert.equal(req.get('cookie'), 'platform=test');
    assert.equal(req.get('x-csrf-token'), 'test-token');
    assert.deepEqual(req.body, { paused: true });
    res.json({ ok: true });
  });
  const identity = remote.listen(0, '127.0.0.1');
  await once(identity, 'listening');
  const address = identity.address();
  assert.ok(address && typeof address !== 'string');
  const site = express();
  site.use(...identityProxy('http://127.0.0.1:' + address.port));
  site.use((_req, res) => res.sendStatus(404));
  const http = site.listen(0, '127.0.0.1');
  await once(http, 'listening');
  try {
    const bound = http.address();
    assert.ok(bound && typeof bound !== 'string');
    const origin = 'http://127.0.0.1:' + bound.port;
    const unauthenticated = await fetch(origin + '/api/platform/feedback?filter=new');
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await unauthenticated.json(), { error: 'Sesión administrativa requerida.' });
    const result = await fetch(origin + '/api/platform/campaigns/' + campaign, {
      method: 'POST',
      headers: {
        cookie: 'platform=test',
        'x-csrf-token': 'test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true });
    assert.equal((await fetch(origin + '/api/platform/campaigns/F04')).status, 404);
  } finally {
    await Promise.all(
      [http, identity].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  }
});
