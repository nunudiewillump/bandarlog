// Static raster artwork keeps the email actions compatible with common mail clients.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Play, LockKeyhole, Check } from 'lucide-react';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/mail-icons', { recursive: true });
for (const [name, Icon, color] of [
  ['in_progress', Play, '#ffffff'],
  ['blocked', LockKeyhole, '#124d38'],
  ['done', Check, '#ffffff'],
]) {
  const svg = renderToStaticMarkup(createElement(Icon, { size: 48, color, strokeWidth: 2.5 }));
  await sharp(Buffer.from(svg)).png().toFile(`public/mail-icons/${name}.png`);
}
// Three overlapping layers of curved grass blades use the canopy's forest palette.
const layers = [
  ['#163e2b', 24, 67],
  ['#275d3d', 34, 83],
  ['#326b44', 42, 101],
];
let grass = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120">';
for (const [color, count, base] of layers) {
  grass += `<g fill="${color}"><path d="M0 ${base} Q300 ${base - 10} 600 ${base + 1} T1200 ${base} V120H0Z"/>`;
  for (let i = 0; i <= count; i++) {
    const x = (i * 1200) / count,
      height = 25 + (Math.sin(i * 2.43 + base) + 1) * 20,
      lean = Math.sin(i * 1.73 + base) * 19;
    grass += `<path d="M${x - 13} ${base + 7} Q${x - 9} ${base - height * 0.5} ${x + lean} ${base - height} Q${x + 4} ${base - height * 0.35} ${x + 12} ${base + 7}Z"/>`;
    grass += `<path d="M${x + 3} ${base + 7} Q${x + 20} ${base - height * 0.6} ${x + 30} ${base - height * 0.65} Q${x + 20} ${base - 6} ${x + 17} ${base + 7}Z"/>`;
  }
  grass += '</g>';
}
grass += '</svg>';
await sharp(Buffer.from(grass)).png().toFile('public/mail-grass.png');
