import { randomBytes } from 'node:crypto';
export const GOOGLE_RETURN_LIFETIME = 60_000;
/** Ticket never travels in a URL. The caller may also set a one-minute HttpOnly return cookie. */
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
    html: `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volver a Bandarlog</title><body><h1>Vuelve a Bandarlog</h1><p>Vuelve a Bandarlog desde su icono para completar el acceso.</p><script nonce="${nonce}">const message=${payload},target=${target};if(window.opener){let done=false;const send=()=>{if(done)return;try{window.opener.postMessage(message,target);window.opener.focus();}catch{}};const repeat=setInterval(send,250);const deadline=setTimeout(()=>{done=true;clearInterval(repeat);window.close();},60000);window.addEventListener('message',event=>{if(event.origin===target&&event.source===window.opener&&event.data?.type==='bandarlog.google.ack'&&event.data.ticket===message.ticket){done=true;clearInterval(repeat);clearTimeout(deadline);window.close();}});send();}else{window.close();}</script></body></html>`,
  };
}
