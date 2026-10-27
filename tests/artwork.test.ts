import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { artworkImage } from '../server/artwork';
test('artwork accepts bounded raster images and rejects SVG or arbitrary external URLs', async () => {
  const png = await sharp({
    create: { width: 512, height: 512, channels: 4, background: '#124d38' },
  })
    .png()
    .toBuffer();
  const normalized = await artworkImage('data:image/png;base64,' + png.toString('base64'), 'icon');
  assert.ok(normalized.startsWith('data:image/webp;base64,'));
  const metadata = await sharp(Buffer.from(normalized.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 192);
  await assert.rejects(() => artworkImage('https://example.org/image.svg', 'icon'));
  await assert.rejects(() => artworkImage('data:image/svg+xml;base64,PHN2Zz4=', 'icon'));
});

test('artwork polls short authenticated job requests until CPU inference finishes', async () => {
  const { requestArtwork } = await import('../server/artwork');
  const id = 'a'.repeat(32);
  const calls: { url: string; method: string | undefined }[] = [];
  const responses = [
    { id, status: 'queued' },
    { status: 'running' },
    { status: 'ready', result: { iconUrl: 'icon', mascotUrl: 'mascot' } },
  ];
  const request = (async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only');
    return Response.json(responses.shift());
  }) as typeof fetch;
  const result = await requestArtwork(
    'https://worker.example',
    'test-only',
    { name: 'Cocina', description: '' },
    request,
    { pollIntervalMs: 0, timeoutMs: 1000 },
  );
  assert.deepEqual(result, { iconUrl: 'icon', mascotUrl: 'mascot' });
  assert.deepEqual(
    calls.map((c) => c.method),
    ['POST', 'GET', 'GET'],
  );
  assert.equal(calls[2].url, 'https://worker.example/jobs/' + id);
});

test('artwork rejects expired or failed jobs and never follows a supplied job URL', async () => {
  const { requestArtwork } = await import('../server/artwork');
  for (const failure of [Response.json({ status: 'failed' }), new Response('', { status: 404 })]) {
    let count = 0;
    const request = (async () =>
      ++count === 1 ? Response.json({ id: 'b'.repeat(32) }) : failure) as typeof fetch;
    await assert.rejects(() =>
      requestArtwork(
        'https://worker.example',
        undefined,
        { name: 'Cocina', description: '' },
        request,
      ),
    );
  }
  let calls = 0;
  const unsafe = (async () => {
    calls++;
    return Response.json({ id: 'https://other.example' });
  }) as typeof fetch;
  await assert.rejects(() =>
    requestArtwork(
      'https://worker.example',
      undefined,
      { name: 'Cocina', description: '' },
      unsafe,
    ),
  );
  assert.equal(calls, 1);
});
