import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const round = process.argv[2] || 'initial';
const folder = path.join(root, `renders-${round}`);
const scenes = JSON.parse(await fs.readFile(path.join(root, 'codex/scenes.json'), 'utf8'));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
for (let start = 0; start < scenes.length; start += 6) {
  const current = scenes.slice(start, start + 6);
  const layers = [];
  for (const [index, scene] of current.entries()) {
    const x = (index % 2) * 720;
    const y = Math.floor(index / 2) * 482;
    const label = Buffer.from(`<svg width="720" height="32"><rect width="720" height="32" fill="#103b2d"/><text x="12" y="21" fill="#faf8f2" font-family="sans-serif" font-size="15">${escape(scene.id + ' · ' + scene.title)}</text></svg>`);
    layers.push({ input: label, left: x, top: y });
    layers.push({ input: await sharp(path.join(folder, `${scene.id}-1440.png`)).resize({ width: 720, height: 450, fit: 'contain', background: '#faf8f2' }).toBuffer(), left: x, top: y + 32 });
  }
  const name = `sheet-${String(start / 6 + 1).padStart(2, '0')}.webp`;
  await sharp({ create: { width: 1440, height: 482 * Math.ceil(current.length / 2), channels: 3, background: '#faf8f2' } }).composite(layers).webp({ quality: 94 }).toFile(path.join(folder, name));
}
console.log(`Created ${Math.ceil(scenes.length / 6)} review contact sheets.`);
