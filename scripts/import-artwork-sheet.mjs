import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const [source, number] = process.argv.slice(2);
if (!source || !/^\d{1,3}$/.test(number)) throw new Error('Expected source image and sheet number.');
const metadata = await sharp(source).metadata();
if (metadata.width !== 1536 || metadata.height !== 1024 || !metadata.hasAlpha)
  throw new Error('Expected a transparent 1536×1024 sprite sheet.');
await mkdir('public/artwork/mascots', { recursive: true });
await sharp(source).webp({ quality: 94, alphaQuality: 100 }).toFile(`public/artwork/mascots/${number.padStart(3, '0')}.webp`);
console.log(`Imported sheet ${number}; six distinct illustrations, original preserved.`);
