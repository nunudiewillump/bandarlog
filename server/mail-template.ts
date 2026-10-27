type Action = { label: string; url: string; secondary?: boolean };
type Detail = { label: string; value: string };
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function renderMail({
  title,
  body,
  appUrl,
  details = [],
  actions = [],
}: {
  title: string;
  body: string;
  appUrl: string;
  details?: Detail[];
  actions?: Action[];
}) {
  const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? escapeHtml(url) : '#');
  if (!actions.length) {
    const link = body.match(/https?:\/\/[^\s]+/);
    if (link)
      actions = [
        {
          label: title.includes('acceso')
            ? 'Entrar en Bandarlog'
            : title.includes('invita')
              ? 'Abrir invitación'
              : 'Ver en Bandarlog',
          url: link[0],
        },
      ];
  }
  const paragraphs = body
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      if (/^https?:\/\/[^\s]+$/.test(line.trim())) return '';
      const urls = [...line.matchAll(/https?:\/\/[^\s]+/g)];
      let offset = 0,
        html = '';
      for (const match of urls) {
        html += escapeHtml(line.slice(offset, match.index));
        html += `<a href="${safeUrl(match[0])}" style="color:#124d38;word-break:break-all">Abrir enlace</a>`;
        offset = match.index! + match[0].length;
      }
      return `<p style="margin:0 0 12px;line-height:1.65">${html + escapeHtml(line.slice(offset))}</p>`;
    })
    .join('');
  const buttons = actions
    .filter((a) => /^https?:\/\//.test(a.url))
    .map(
      (a) =>
        `<a href="${safeUrl(a.url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:13px 18px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px;background:${a.secondary ? '#f2f1ea' : '#124d38'};color:${a.secondary ? '#124d38' : '#ffffff'}">${escapeHtml(a.label)}</a>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#faf8f2;color:#24352b;font-family:'Nunito Sans',Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)} · Bandarlog</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f2"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:800px"><tr><td style="padding:8px 12px 24px"><table role="presentation"><tr><td><img src="${safeUrl(appUrl + '/brand-mark.png')}" width="42" height="42" alt="" style="border-radius:10px;vertical-align:middle"></td><td style="padding-left:10px"><strong style="font-size:26px;letter-spacing:-1px;color:#124d38">Bandarlog</strong></td></tr></table></td></tr><tr><td style="background:#ffffff;border:1px solid #e6e8df;border-radius:16px;padding:30px 24px"><h1 style="font-size:25px;line-height:1.3;margin:0 0 22px;color:#24352b">${escapeHtml(title)}</h1>${details.length ? `<table role="presentation" width="100%" style="background:#f2f1ea;border-radius:10px;margin-bottom:22px;padding:14px">${details.map((d) => `<tr><td style="padding:7px;font-size:12px;color:#657367;vertical-align:top">${escapeHtml(d.label)}</td><td style="padding:7px;font-size:13px;font-weight:700">${escapeHtml(d.value)}</td></tr>`).join('')}</table>` : ''}<div style="font-size:14px;color:#546256">${paragraphs}</div>${buttons ? `<div style="padding-top:14px">${buttons}</div>` : ''}</td></tr><tr><td style="padding:18px;text-align:center;font-size:12px;line-height:1.6;color:#738078">${actions.some((a) => a.url.includes('action=')) ? 'Los cambios de tareas se confirman en Bandarlog.' : ''}</td></tr></table></td></tr></table></body></html>`;
}
