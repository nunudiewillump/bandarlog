export const MAIL_MAIN_START = '<!--bandarlog-main:start-->';
export const MAIL_MAIN_END = '<!--bandarlog-main:end-->';
export const MAIL_NOTE_START = '<!--bandarlog-note:start-->';
export const MAIL_NOTE_END = '<!--bandarlog-note:end-->';
type Action = {
  label: string;
  url: string;
  secondary?: boolean;
  kind?: 'in_progress' | 'blocked' | 'done';
};
type Detail = { label: string; value: string };
type Summary = {
  progress: number | null;
  completed: number;
  total: number;
  counts: Detail[];
  heading: string;
  empty: string;
  items: { title: string; context: string; note: string; url: string }[];
  remaining: number;
};
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
  eyebrow,
  intro,
  summary,
  actionLabels = false,
}: {
  title: string;
  body: string;
  appUrl: string;
  details?: Detail[];
  actions?: Action[];
  eyebrow?: string;
  intro?: string;
  summary?: Summary;
  actionLabels?: boolean;
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
              ? 'Aceptar invitación'
              : 'Ver en Bandarlog',
          url: link[0],
        },
      ];
  }
  const accessCode =
    title === 'Tu código de acceso a Bandarlog'
      ? body.match(/^Tu código de acceso es: (\d{6})$/m)?.[1]
      : undefined;
  const codePanel = accessCode
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f2f1ea;border-radius:12px"><tr><td align="center" style="padding:18px 8px"><img src="${safeUrl(appUrl + '/monkey-key-2d.png')}" width="81" height="120" alt="El mono Bandarlog sostiene una llave" style="display:block;width:81px;height:120px;border:0;margin:0 auto 12px"><div data-mail-code style="font-size:36px;line-height:48px;font-weight:800;letter-spacing:6px;color:#124d38;font-variant-numeric:tabular-nums">${accessCode}</div></td></tr></table>`
    : '';
  const paragraphs = body
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      if (
        /^https?:\/\/[^\s]+$/.test(line.trim()) ||
        (accessCode && /^Tu código de acceso es: \d{6}$/.test(line))
      )
        return '';
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
    .filter((a) => !a.kind && /^https?:\/\//.test(a.url))
    .map(
      (a) =>
        `<a href="${safeUrl(a.url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:13px 18px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px;background:${a.secondary ? '#f2f1ea' : '#124d38'};color:${a.secondary ? '#124d38' : '#ffffff'}">${escapeHtml(a.label)}</a>`,
    )
    .join('');
  const summaryPanel = summary
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#faf8f2;border-radius:12px"><tr><td style="padding:20px"><p style="margin:0 0 6px;font-size:14px;color:#52675a">Progreso total del proyecto</p><p style="margin:0 0 10px;font-size:32px;line-height:1.2;font-weight:800;color:#124d38">${summary.progress === null ? 'Sin tareas' : summary.progress + '%'}</p><p style="margin:0;font-size:14px">${summary.completed} de ${summary.total} tareas terminadas</p>${summary.progress !== null ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;background:#dfe5da"><tr>${summary.progress > 0 ? `<td width="${summary.progress}%" height="8" style="background:#124d38;font-size:0;line-height:8px">&nbsp;</td>` : ''}${summary.progress < 100 ? `<td height="8" style="font-size:0;line-height:8px">&nbsp;</td>` : ''}</tr></table>` : ''}</td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px">${summary.counts.map((count) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e6e8df;font-size:14px">${escapeHtml(count.label)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e6e8df;font-size:16px;font-weight:700">${escapeHtml(count.value)}</td></tr>`).join('')}</table><h2 style="margin:0 0 8px;font-size:19px;color:#24352b">${escapeHtml(summary.heading)}</h2>${summary.items.length ? summary.items.map((item) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:14px 0;border-bottom:1px solid #e6e8df;overflow-wrap:anywhere;word-break:break-word"><a href="${safeUrl(item.url)}" style="color:#124d38;font-size:16px;line-height:1.5;font-weight:700;text-decoration:underline">${escapeHtml(item.title)}</a><p style="margin:5px 0 0;font-size:13px;line-height:1.6;color:#52675a">${escapeHtml(item.context)}</p>${item.note ? `<p style="margin:5px 0 0;font-size:14px;line-height:1.6;color:#24352b">${escapeHtml(item.note)}</p>` : ''}</td></tr></table>`).join('') : `<p style="font-size:14px;line-height:1.7;color:#52675a">${escapeHtml(summary.empty)}</p>`}${summary.remaining ? `<p style="font-size:13px;line-height:1.6;color:#52675a">${summary.remaining} tareas más requieren atención. Puedes consultarlas en el proyecto.</p>` : ''}<p style="margin:16px 0;font-size:12px;line-height:1.6;color:#52675a">Las tareas vencidas y bloqueadas pueden coincidir. El progreso es acumulado, no solo de esta semana.</p>`
    : '';
  const colors = { in_progress: '#276cae', blocked: '#f7c948', done: '#124d38' };
  const order = { in_progress: 0, blocked: 1, done: 2 };
  const statusActions = actions
    .filter((a) => a.kind && /^https?:\/\//.test(a.url))
    .sort((a, b) => order[a.kind!] - order[b.kind!]);
  const statusButtons = statusActions.length
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:12px"><tr>${statusActions.map((a) => `<td style="padding:0 ${actionLabels ? '6' : '12'}px 0 0"><a data-mail-action="${a.kind}" href="${safeUrl(a.url)}" aria-label="${escapeHtml(a.label)}" title="${escapeHtml(a.label)}" style="display:inline-block;padding:12px ${actionLabels ? '8px' : '12px'};line-height:${actionLabels ? '1.4' : '0'};border-radius:9px;background:${colors[a.kind!]};text-decoration:none"><img src="${safeUrl(appUrl + '/mail-icons/' + a.kind + '.png')}" width="24" height="24" alt="${escapeHtml(a.label)}" style="display:block;border:0;width:24px;height:24px">${actionLabels ? `<span style="display:block;margin-top:8px;font-size:12px;font-weight:700;color:${a.kind === 'blocked' ? '#24352b' : '#ffffff'}">${escapeHtml(a.kind === 'in_progress' ? 'En curso' : a.kind === 'blocked' ? 'Bloquear' : 'Completar')}</span>` : ''}</a></td>`).join('')}</tr></table><img src="${safeUrl(appUrl + '/mail-grass.png')}" width="752" height="75" alt="" role="presentation" style="display:block;width:100%;height:auto;border:0;margin-top:20px">`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#faf8f2;color:#24352b;font-family:'Nunito Sans',Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)} · Bandarlog</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f2"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:800px"><tr><td style="padding:8px 12px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="42" style="vertical-align:middle"><img src="${safeUrl(appUrl + '/brand-mark.png')}" width="42" height="42" alt="" style="display:block;border:0;vertical-align:middle"></td><td style="padding-left:10px;vertical-align:middle"><strong style="font-size:26px;letter-spacing:-1px;color:#124d38">Bandarlog</strong></td><td width="84" align="right" style="vertical-align:middle"><img src="${safeUrl(appUrl + '/monkey-wave-2d.png')}" width="84" height="96" alt="Un mono de Bandarlog saludando" style="display:block;width:84px;height:96px;border:0"></td></tr></table></td></tr><tr><td style="background:#ffffff;border:1px solid #e6e8df;border-radius:16px;padding:30px 24px">${MAIL_MAIN_START}${eyebrow ? `<p style="margin:0 0 10px;font-size:13px;line-height:1.6;font-weight:700;color:#124d38">${escapeHtml(eyebrow)}</p>` : ''}<h1 style="font-size:25px;line-height:1.3;margin:0 0 22px;color:#24352b;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(title)}</h1>${intro ? `<p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#52675a">${escapeHtml(intro)}</p>` : ''}${codePanel}${summaryPanel}${details.length ? `<table role="presentation" width="100%" style="background:#f2f1ea;border-radius:10px;margin-bottom:22px;padding:14px">${details.map((d) => `<tr><td style="padding:7px;font-size:12px;color:#657367;vertical-align:top">${escapeHtml(d.label)}</td><td style="padding:7px;font-size:13px;font-weight:700;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(d.value)}</td></tr>`).join('')}</table>` : ''}<div style="font-size:14px;color:#546256">${paragraphs}</div>${buttons ? `<div style="padding-top:14px">${buttons}</div>` : ''}${statusButtons}${MAIL_MAIN_END}</td></tr><tr><td style="padding:18px;text-align:center;font-size:12px;line-height:1.6;color:#738078">${MAIL_NOTE_START}${actions.some((a) => a.url.includes('action=')) ? 'Los cambios de tareas se confirman en Bandarlog.' : ''}${MAIL_NOTE_END}</td></tr></table></td></tr></table></body></html>`;
}
