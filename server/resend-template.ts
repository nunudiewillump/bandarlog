import {
  renderMail,
  escapeHtml,
  MAIL_MAIN_START,
  MAIL_MAIN_END,
  MAIL_NOTE_START,
  MAIL_NOTE_END,
} from './mail-template.js';

// Resend accepts 50 variables and at most 2,000 UTF-16 units per string.
const HTML_BLOCKS = 40,
  TEXT_BLOCKS = 8;
const keys = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => prefix + '_' + String(i).padStart(2, '0'));
export const resendVariableNames = [
  ...keys('CONTENT', HTML_BLOCKS),
  ...keys('PLAIN', TEXT_BLOCKS),
  'SUBJECT',
  'NOTE',
];
function between(html: string, start: string, end: string) {
  const left = html.indexOf(start),
    right = html.indexOf(end, left + start.length);
  return left < 0 || right < 0 ? null : html.slice(left + start.length, right);
}
function chunks(value: string, max: number) {
  const parts: string[] = [];
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 2000, value.length);
    if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
    parts.push(value.slice(start, end));
    start = end;
  }
  return parts.length > max ? null : Array.from({ length: max }, (_, i) => parts[i] || '');
}
/** Legacy snapshots and unusually large messages remain deliverable as inline HTML. */
export function resendVariables(subject: string, text: string, html: string) {
  const content = between(html, MAIL_MAIN_START, MAIL_MAIN_END),
    note = between(html, MAIL_NOTE_START, MAIL_NOTE_END);
  if (content === null || note === null) return null;
  const body = chunks(content, HTML_BLOCKS),
    plain = chunks(text, TEXT_BLOCKS),
    title = escapeHtml(subject);
  if (!body || !plain || title.length > 2000 || note.length > 2000) return null;
  return Object.fromEntries([
    ...keys('CONTENT', HTML_BLOCKS).map((key, i) => [key, body[i]]),
    ...keys('PLAIN', TEXT_BLOCKS).map((key, i) => [key, plain[i]]),
    ['SUBJECT', title],
    ['NOTE', note],
  ]) as Record<string, string>;
}
/** Provision once with a setup key. The application only sends by published ID/alias. */
export function resendTemplateDefinition(appUrl: string) {
  let html = renderMail({
    title: 'RESEND_SUBJECT_PLACEHOLDER',
    body: 'RESEND_CONTENT_PLACEHOLDER',
    appUrl,
  });
  const replace = (source: string, start: string, end: string, value: string) => {
    const left = source.indexOf(start),
      right = source.indexOf(end, left + start.length);
    if (left < 0 || right < 0) throw new Error('No se pudo preparar la plantilla de Bandarlog.');
    return source.slice(0, left) + value + source.slice(right + end.length);
  };
  html = replace(
    html,
    MAIL_MAIN_START,
    MAIL_MAIN_END,
    keys('CONTENT', HTML_BLOCKS)
      .map((key) => '{{{' + key + '}}}')
      .join(''),
  );
  html = replace(html, MAIL_NOTE_START, MAIL_NOTE_END, '{{{NOTE}}}').replaceAll(
    'RESEND_SUBJECT_PLACEHOLDER',
    '{{{SUBJECT}}}',
  );
  return {
    name: 'Bandarlog · transaccional',
    alias: 'bandarlog-transactional-v1',
    html,
    text: keys('PLAIN', TEXT_BLOCKS)
      .map((key) => '{{{' + key + '}}}')
      .join(''),
    variables: resendVariableNames.map((key) => ({ key, type: 'string' as const })),
  };
}
