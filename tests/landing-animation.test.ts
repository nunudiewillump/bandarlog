import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

test('the keyboard asset is a real animated puppet with a stable desk and a complete reduced-motion poster', async () => {
  for (const width of [480, 768]) {
    const file = `public/landing/arms-v2/monkey-keyboard-animated-${width}.webp`;
    const metadata = await sharp(file, { animated: true }).metadata();
    assert.equal(metadata.width, width);
    assert.ok(metadata.pages! > 80, 'many rendered frames, not two crossfaded poses');
    assert.equal(metadata.loop, 0);
    assert.ok(Math.abs(metadata.delay!.reduce((a, b) => a + b, 0) - 8000) < 20);
    const first = await sharp(file, { page: 0 }).ensureAlpha().raw().toBuffer();
    const later = await sharp(file, { page: 10 }).ensureAlpha().raw().toBuffer();
    assert.ok(
      first.some((value, i) => Math.abs(value - later[i]) > 10),
      'the puppet actually moves',
    );
    const scale = width / 768;
    const desk = {
      left: Math.round(500 * scale),
      top: Math.round(495 * scale),
      width: Math.round(100 * scale),
      height: Math.round(30 * scale),
    };
    const tableA = await sharp(file, { page: 0 }).extract(desk).raw().toBuffer();
    const tableB = await sharp(file, { page: 10 }).extract(desk).raw().toBuffer();
    const difference =
      tableA.reduce((sum, value, i) => sum + Math.abs(value - tableB[i]), 0) / tableA.length;
    assert.ok(difference < 4, 'the desk does not jump between scene poses');
  }
  const poster = await sharp('public/landing/arms-v2/monkey-keyboard-poster.webp')
    .ensureAlpha()
    .raw()
    .toBuffer();
  let opaque = 0;
  for (let i = 3; i < poster.length; i += 4) if (poster[i] > 128) opaque++;
  assert.ok(opaque / (768 * 768) > 0.25, 'poster contains the full figure and furniture');
});

test('correcting the arm rig preserves the head, laptop and lower body', async () => {
  const previous = 'public/landing/monkey-keyboard-poster.webp';
  const corrected = 'public/landing/arms-v2/monkey-keyboard-poster.webp';
  for (const region of [
    { left: 70, top: 15, width: 400, height: 327 },
    { left: 460, top: 300, width: 220, height: 430 },
    { left: 70, top: 510, width: 610, height: 230 },
  ]) {
    const before = await sharp(previous).extract(region).ensureAlpha().raw().toBuffer();
    const after = await sharp(corrected).extract(region).ensureAlpha().raw().toBuffer();
    const difference =
      before.reduce((sum, value, i) => sum + Math.abs(value - after[i]), 0) / before.length;
    assert.ok(difference < 3, 'protected artwork remains stable within WebP compression tolerance');
  }
});
