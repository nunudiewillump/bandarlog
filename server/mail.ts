import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';

type MailInput = Pick<Mail.Options, 'from' | 'to' | 'subject' | 'text' | 'headers'>;
export function mailProvider(env: NodeJS.ProcessEnv = process.env) {
  return env.MAIL_TRANSPORT || (env.SMTP_HOST ? 'smtp' : 'preview');
}

export function createMailTransport(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
) {
  const provider = mailProvider(env);
  if (provider === 'preview') return null;
  if (provider === 'smtp') {
    const smtp = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_PORT === '465',
      requireTLS: env.SMTP_PORT !== '465',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 15000,
      socketTimeout: 20000,
    });
    return { kind: 'smtp', sendMail: (message: MailInput) => smtp.sendMail(message) };
  }
  if (provider !== 'gmail_api')
    throw new Error('MAIL_TRANSPORT debe ser smtp, gmail_api o preview.');
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  let accessToken = '',
    expiresAt = 0;
  let refreshing: Promise<string> | null = null;
  async function token() {
    if (accessToken && Date.now() < expiresAt) return accessToken;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const response = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GMAIL_CLIENT_ID || '',
          client_secret: env.GMAIL_CLIENT_SECRET || '',
          refresh_token: env.GMAIL_REFRESH_TOKEN || '',
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          `Google OAuth no disponible (${response.status}). Revisa la autorización privada.`,
        );
      const result = (await response.json()) as { access_token?: string; expires_in?: number };
      if (!result.access_token) throw new Error('Google OAuth no devolvió un token de acceso.');
      accessToken = result.access_token;
      expiresAt = Date.now() + (Number(result.expires_in || 3600) - 60) * 1000;
      return accessToken;
    })();
    try {
      return await refreshing;
    } finally {
      refreshing = null;
    }
  }
  return {
    kind: 'gmail_api',
    async sendMail(message: MailInput) {
      const built = await composer.sendMail(message);
      if (!Buffer.isBuffer(built.message)) throw new Error('No se pudo componer el correo MIME.');
      const raw = built.message.toString('base64url');
      const response = await request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        if (response.status === 401) {
          accessToken = '';
          expiresAt = 0;
        }
        throw new Error(`La API de Gmail rechazó el envío (${response.status}).`);
      }
      const result = (await response.json()) as { id?: string };
      if (!result.id) throw new Error('Gmail no confirmó el identificador del mensaje.');
      return { messageId: result.id };
    },
  };
}
