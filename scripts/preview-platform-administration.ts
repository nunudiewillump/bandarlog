import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
// Review artifact only: no database, environment secrets, scheduler or mail transport.
const root = 'docs/platform-administration';
const asset = async (path: string, mime: string) =>
  `data:${mime};base64,${(await readFile('public/' + path)).toString('base64')}`;
let html = await readFile(`${root}/preview-source.html`, 'utf8');
for (const [name, path, mime] of [
  ['BRAND', 'brand-mark.png', 'image/png'],
  ['REGULAR', 'public-fonts/poppins-latin-400-normal.woff2', 'font/woff2'],
  ['BOLD', 'public-fonts/poppins-latin-700-normal.woff2', 'font/woff2'],
  ['BUNGEE', 'public-fonts/bungee-latin-400-normal.woff2', 'font/woff2'],
])
  html = html.replaceAll(`{{${name}}}`, await asset(path, mime));
const model = stripTypeScriptTypes(await readFile(`${root}/usage-model.ts`, 'utf8'), {
  mode: 'strip',
})
  .replace(/[ \t]+$/gm, '')
  .replace(/^export (?=(?:const|function))/gm, '')
  .replace(/<\/script/gi, '<\\/script');
html = html.replace('/* USAGE_MODEL */', model);
await mkdir(root, { recursive: true });
await writeFile(`${root}/preview.html`, html);
console.log(
  'Vista autónoma generada con datos ficticios; no se envía correo ni se consulta la base de datos.',
);
