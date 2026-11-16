import { randomBytes } from 'node:crypto';
export const GOOGLE_RETURN_LIFETIME = 60_000;
/** Ticket travels only in this no-store document's postMessage, never a URL or cookie. */
export function googleReturnPage(origin: string, ticket?: string) {
  if (ticket && !/^[a-f0-9]{64}$/.test(ticket)) throw Error('Invalid handoff ticket');
  const nonce = randomBytes(24).toString('base64');
  const payload = JSON.stringify({
    type: 'bandarlog.google.return',
    ...(ticket ? { ticket } : { error: true }),
  }).replaceAll('<', '\\u003c');
  const target = JSON.stringify(new URL(origin).origin).replaceAll('<', '\\u003c');
  return {
    csp: `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'`,
    html: `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volver a Bandarlog</title><body><h1>Vuelve a Bandarlog</h1><p>Si la aplicación no ha completado el acceso, vuelve a abrirla desde su icono y utiliza el código de correo.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${payload},${target});window.close();}</script></body></html>`,
  };
}
