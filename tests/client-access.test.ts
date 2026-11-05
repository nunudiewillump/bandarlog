import { test } from 'node:test';
import assert from 'node:assert/strict';
const stored = new Map<string, string>();
const remembered: unknown[] = [];
Object.assign(globalThis, {
  location: { pathname: '/acceso' },
  sessionStorage: {
    getItem: (key: string) => stored.get(key) || null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  },
  BandarlogOffline: {
    allowed: () => false,
    remember: async (_path: string, value: unknown) => {
      remembered.push(value);
      return value;
    },
    cached: async () => null,
    status: async () => ({ pending: 0, error: '' }),
    clear: async () => {},
  },
});
const { api, setCSRF, ApiError } = await import('../src/api');
const { pendingAccess, rememberAccess, forgetAccess } = await import('../src/pending-access');

test('pending access survives reload with expiry and group isolation, without storing the code', () => {
  rememberAccess('one@example.test', 'a'.repeat(64), 600, 60);
  assert.equal(pendingAccess()?.email, 'one@example.test');
  assert.deepEqual(Object.keys(pendingAccess()!).sort(), [
    'challengeId',
    'email',
    'expiresAt',
    'resendAt',
  ]);
  location.pathname = '/g/' + 'b'.repeat(32) + '/';
  assert.equal(pendingAccess(), null);
  location.pathname = '/acceso';
  rememberAccess('one@example.test', 'a'.repeat(64), -1, 60);
  assert.equal(pendingAccess(), null);
  forgetAccess();
});

test('simultaneous reads share a request but never remain cached after settling', async () => {
  const original = globalThis.fetch;
  let count = 0,
    finish!: (value: Response) => void;
  globalThis.fetch = async () => {
    count++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  try {
    const first = api('/data'),
      second = api('/data');
    assert.equal(first, second);
    assert.equal(count, 1);
    finish(Response.json({ version: 1 }));
    assert.deepEqual(await second, { version: 1 });
    const next = api('/data');
    assert.equal(count, 2);
    finish(Response.json({ version: 2 }));
    assert.deepEqual(await next, { version: 2 });
  } finally {
    globalThis.fetch = original;
  }
});

test('writes and different groups never reuse an earlier in-flight read', async () => {
  const original = globalThis.fetch;
  const calls: { finish: (value: Response) => void; url: string }[] = [];
  globalThis.fetch = async (url) =>
    new Promise((finish) => {
      calls.push({ finish, url: String(url) });
    });
  setCSRF('unit-only-csrf');
  try {
    const before = api('/data');
    const write = api('/tasks', 'POST', { title: 'isolated' });
    const during = api('/data');
    assert.equal(calls.length, 3);
    calls[1].finish(Response.json({ ok: true }));
    await write;
    const after = api('/data');
    assert.equal(calls.length, 4);
    location.pathname = '/g/' + 'c'.repeat(32) + '/';
    const other = api('/data');
    assert.equal(calls.length, 5);
    assert.match(calls[4].url, /\/g\/c{32}\/api\/data/);
    for (const index of [0, 2, 3, 4]) calls[index].finish(Response.json({ version: index }));
    assert.deepEqual(await Promise.all([before, during, after, other]), [
      { version: 0 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
    ]);
  } finally {
    globalThis.fetch = original;
    location.pathname = '/acceso';
  }
});

test('cooldown errors retain recovery metadata for the code form', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: 'Espera', retryAfter: 45, expiresIn: 500, challengeId: 'a'.repeat(64) },
      { status: 429 },
    );
  try {
    await assert.rejects(
      () => api('/auth/code/request', 'POST', { email: 'one@example.test' }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 429);
        assert.equal(error.recovery.retryAfter, 45);
        assert.equal(error.recovery.challengeId, 'a'.repeat(64));
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('an old session read cannot repopulate offline storage after a logout', async () => {
  const original = globalThis.fetch;
  let finish!: (value: Response) => void;
  const count = remembered.length;
  globalThis.fetch = async (_url, options) =>
    options?.method === 'POST'
      ? Response.json({ ok: true })
      : new Promise((resolve) => {
          finish = resolve;
        });
  try {
    const old = api('/me');
    await api('/logout', 'POST', {});
    finish(Response.json({ user: { id: 'previous-session' } }));
    await old;
    assert.equal(remembered.length, count);
  } finally {
    globalThis.fetch = original;
  }
});
