import { z } from 'zod';
import { mailProvider } from './mail.js';

// Validate deployment settings before connecting to or migrating the database.
// Errors name the setting, never its value.
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const appUrl = env.APP_URL || 'http://localhost:5173';
  let origin: URL;
  try {
    origin = new URL(appUrl);
  } catch {
    throw new Error('APP_URL debe ser un origen válido.');
  }
  if (
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error('APP_URL debe contener solo el origen, sin ruta ni parámetros.');
  }
  if (env.BOOTSTRAP_EMAIL && !z.email().safeParse(env.BOOTSTRAP_EMAIL).success) {
    throw new Error('BOOTSTRAP_EMAIL debe ser un correo válido.');
  }
  if (production) {
    if (!env.APP_URL || origin.protocol !== 'https:')
      throw new Error('Producción requiere APP_URL HTTPS.');
    if (!env.DATABASE_URL) throw new Error('Producción requiere DATABASE_URL.');
    const provider = mailProvider(env);
    if (!['smtp', 'gmail_api'].includes(provider))
      throw new Error('Producción requiere MAIL_TRANSPORT=smtp o gmail_api.');
    const mailRequirements =
      provider === 'gmail_api'
        ? ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'MAIL_FROM']
        : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
    for (const name of mailRequirements) {
      if (!env[name]) throw new Error(`Producción requiere ${name}.`);
    }
    if (env.SMTP_PORT && !['465', '587'].includes(env.SMTP_PORT))
      throw new Error('SMTP_PORT debe ser 465 o 587.');
  }
  if (env.DATABASE_URL) {
    let dbUrl: URL;
    try {
      dbUrl = new URL(env.DATABASE_URL);
    } catch {
      throw new Error('DATABASE_URL no es una URL PostgreSQL válida.');
    }
    if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol))
      throw new Error('DATABASE_URL debe usar PostgreSQL.');
    if (
      production &&
      dbUrl.hostname.endsWith('.neon.tech') &&
      dbUrl.searchParams.get('sslmode') !== 'verify-full'
    ) {
      throw new Error('La conexión Neon de producción requiere sslmode=verify-full.');
    }
  }
  if (production && (!env.AUTH_CHALLENGE_SECRET || env.AUTH_CHALLENGE_SECRET.length < 32))
    throw new Error(
      'Producción requiere AUTH_CHALLENGE_SECRET aleatorio de al menos 32 caracteres.',
    );
  if (Boolean(env.GOOGLE_LOGIN_CLIENT_ID) !== Boolean(env.GOOGLE_LOGIN_CLIENT_SECRET))
    throw new Error('Configura GOOGLE_LOGIN_CLIENT_ID y GOOGLE_LOGIN_CLIENT_SECRET conjuntamente.');
  return { production, appUrl: origin.origin };
}
