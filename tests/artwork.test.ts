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
