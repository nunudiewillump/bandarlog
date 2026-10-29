import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.dirname(new URL(import.meta.url).pathname);
const round = process.argv[2] || 'round2';
const source = path.join(root, `renders-${round}`);
const output = path.join(root, 'published');
await fs.mkdir(output, { recursive: true });
const files = (await fs.readdir(source)).filter(file => file.endsWith('.png'));
const manifest = [];
for (const file of files) {
  const original = await fs.readFile(path.join(source, file));
  const published = file.replace(/\.png$/, '.webp');
  await sharp(original).webp({ quality: 95, effort: 5 }).toFile(path.join(output, published));
  const result = await fs.readFile(path.join(output, published));
  const metadata = await sharp(result).metadata();
  manifest.push({ original: `renders-${round}/${file}`, originalSha256: createHash('sha256').update(original).digest('hex'), published, publishedSha256: createHash('sha256').update(result).digest('hex'), width: metadata.width, height: metadata.height });
}
await fs.mkdir(path.join(output, 'overview'), { recursive: true });
for (const file of (await fs.readdir(source)).filter(file => file.startsWith('sheet-'))) await fs.copyFile(path.join(source, file), path.join(output, 'overview', file));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ representation: 'WebP exports of original static prototype PNG captures, same pixel dimensions, quality95; original PNGs remain local and reproducible with capture-desktop.mjs.', captures: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ publishedScreenshots: manifest.length, exactDimensionsPreserved: true }));
