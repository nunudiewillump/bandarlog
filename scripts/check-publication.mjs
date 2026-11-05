import { publicInfo } from '../shared/public-info.ts';
const base = new URL(process.argv[2] || publicInfo.origin);
if (
  !['https:', 'http:'].includes(base.protocol) ||
  base.pathname !== '/' ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
)
  throw new Error('Indica solo el origen público, sin rutas, credenciales ni parámetros.');
if (base.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(base.hostname))
  throw new Error('El dominio público debe usar HTTPS.');
const checks = [
  ['/', ['Menos lío', '/crear-grupo', '/privacidad']],
  ['/presentacion', ['Qué es Bandarlog', 'coordinación para grupos y equipos', 'Gmail API']],
  ['/privacidad', [publicInfo.responsible, publicInfo.contact, 'gmail.send', 'Uso Limitado']],
  ['/condiciones', [publicInfo.responsible, publicInfo.contact]],
  ['/crear-grupo', ['Enviar solicitud', 'name="terms"']],
  ['/suscripcion-demo', ['No se realizan cobros', 'disabled']],
  ['/robots.txt', ['Disallow: /g/', 'Disallow: /api/']],
  ['/sitemap.xml', [base.origin + '/privacidad']],
  ['/api/health', ['"ok":true']],
];
let failures = 0;
for (const [path, expected] of checks) {
  try {
    const response = await fetch(new URL(path, base), {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const ok =
      response.status === 200 &&
      expected.every((text) => body.includes(text)) &&
      !response.headers.has('set-cookie');
    console.log(`${ok ? 'OK' : 'FAIL'} ${path} (${response.status})`);
    if (!ok) failures++;
  } catch {
    console.log(`FAIL ${path} (sin respuesta válida)`);
    failures++;
  }
}
console.log(
  'Comprobación pública de solo lectura: no envía correos ni certifica la autorización de Gmail o la aprobación de Google.',
);
process.exitCode = failures ? 1 : 0;
