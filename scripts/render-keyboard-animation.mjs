/** Offline asset build: an articulated 2D puppet, not crossfaded scene images.
 * Requires the existing sharp package and ffmpeg on the maintainer's machine.
 * Runtime serves the resulting animated WebP; no canvas or animation dependency.
 */
import sharp from 'sharp';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const execute = promisify(execFile);
const assetSizes = {};
const assets = Object.fromEntries(
  await Promise.all(
    ['base', 'head', 'arm-left', 'arm-right'].map(async (name) => {
      const source = sharp(await readFile(`docs/forest-landing/rig/${name}.webp`));
      const { width, height } = await source.metadata();
      assetSizes[name] = { width, height };
      return [name, 'data:image/png;base64,' + (await source.png().toBuffer()).toString('base64')];
    }),
  ),
);
const image = (name, x, y, width, height, aspect = 'none') =>
  `<image xlink:href="${assets[name]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${aspect}"/>`;
// Arms keep their native aspect ratio. Flattening them merges the shoulders/forearms.
const armImage = (name, x, y, width) =>
  image(
    name,
    x,
    y,
    width,
    (width * assetSizes[name].height) / assetSizes[name].width,
    'xMinYMin meet',
  );
const ease = (t) => {
  const v = Math.min(1, Math.max(0, t));
  return v * v * (3 - 2 * v);
};
const blink = (t) =>
  Math.min(
    ...[26 / 15, 3.8, 92 / 15].map(
      (center) => 1 - 0.94 * Math.max(0, 1 - Math.abs(t - center) / 0.13),
    ),
  );
function scene(t) {
  const look = ease((t - 4.4) / 0.8) * (1 - ease((t - 6.4) / 0.8));
  const type = 1 - look;
  const left = -15 + type * (Math.sin(t * Math.PI * 5.5) * 2.1 - 0.8);
  const right = -10 + type * (Math.sin(t * Math.PI * 5.5 + Math.PI) * 2.1 - 0.8) - look * 5;
  const headAngle = 7 * type - 3 * look;
  const gazeX = 9 * type,
    gazeY = 7 * type;
  const eyes = blink(t);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="768" height="768" viewBox="0 0 768 768">
    ${image('base', 72, 301, 606, 424)}
    <g transform="rotate(${right} 311 357)">${armImage('arm-right', 288, 350, 140)}</g>
    <g transform="rotate(${left} 255 363)">${armImage('arm-left', 220, 355, 170)}</g>
    <g transform="rotate(${headAngle} 278 336)">
      ${image('head', 105, 44, 342, 297)}
      <g transform="translate(105 44) scale(.684)">
        <g transform="translate(${gazeX} ${gazeY})" fill="#422e22">
          <ellipse cx="220" cy="245" rx="13" ry="${21 * eyes}"/>
          <ellipse cx="322" cy="232" rx="13" ry="${21 * eyes}"/>
        </g>
        <path d="M207 310C240 ${354 + look * 10} 299 ${358 + look * 12} 340 301" fill="none" stroke="#422e22" stroke-width="9" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
}
if (process.argv.includes('--poster-only')) {
  await mkdir('public/landing/arms-v2', { recursive: true });
  await sharp(Buffer.from(scene(5.6)))
    .webp({ quality: 88, effort: 6 })
    .toFile('public/landing/arms-v2/monkey-keyboard-poster.webp');
  process.exit(0);
}
const output = 'public/landing/arms-v2';
await mkdir(output, { recursive: true });
const folder = await mkdtemp(join(tmpdir(), 'bandarlog-keyboard-frames-'));
try {
  await mkdir('public/landing', { recursive: true });
  const count = 120;
  for (let start = 0; start < count; start += 4)
    await Promise.all(
      Array.from({ length: Math.min(4, count - start) }, async (_, n) => {
        const frame = start + n;
        await sharp(Buffer.from(scene(frame / 15)))
          .png()
          .toFile(join(folder, `frame-${String(frame).padStart(3, '0')}.png`));
      }),
    );
  for (const width of [480, 768]) {
    await execute(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-framerate',
        '15',
        '-i',
        join(folder, 'frame-%03d.png'),
        '-vf',
        `scale=${width}:${width}:flags=lanczos`,
        '-c:v',
        'libwebp_anim',
        '-quality',
        '82',
        '-compression_level',
        '6',
        '-loop',
        '0',
        '-an',
        '-y',
        `public/landing/arms-v2/monkey-keyboard-animated-${width}.webp`,
      ],
      { maxBuffer: 1024 * 1024 },
    );
  }
  await sharp(Buffer.from(scene(5.6)))
    .webp({ quality: 88, effort: 6 })
    .toFile('public/landing/arms-v2/monkey-keyboard-poster.webp');
  console.log(
    'Rendered 120 articulated frames at 15 fps, 8-second seamless loop; desktop/mobile WebP plus reduced-motion poster.',
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
