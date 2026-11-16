import { dispatchSettings } from './dispatch-settings.js';
export type Component = 'http' | 'identity' | 'delivery' | 'development';
export function component(env: NodeJS.ProcessEnv = process.env): Component {
  const value = env.APP_COMPONENT || (env.NODE_ENV === 'production' ? 'http' : 'development');
  if (!['http', 'identity', 'delivery', 'development'].includes(value))
    throw Error('APP_COMPONENT no válido.');
  if (value === 'development' && env.NODE_ENV === 'production')
    throw Error('El modo integrado no está permitido en producción.');
  return value as Component;
}
const mailSecrets = ['RESEND_API_KEY', 'SMTP_PASS', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
export function validateComponentSecrets(env: NodeJS.ProcessEnv = process.env) {
  const mode = component(env);
  if (mode === 'development') return;
  const forbidden =
    mode === 'http'
      ? [
          ...mailSecrets,
          'GROUP_CONTEXT_SECRET',
          'AUTH_CHALLENGE_SECRET',
          'GOOGLE_LOGIN_CLIENT_SECRET',
          'DISPATCH_PRIVATE_KEYS',
        ]
      : mode === 'identity'
        ? [...mailSecrets, 'DISPATCH_PRIVATE_KEYS']
        : ['AUTH_CHALLENGE_SECRET', 'GOOGLE_LOGIN_CLIENT_SECRET'];
  for (const name of forbidden)
    if (env[name]) throw Error(`${name} no debe estar presente en ${mode}.`);
  if (!env.DISPATCH_PUBLIC_KEY) throw Error('Falta DISPATCH_PUBLIC_KEY.');
  if (mode === 'delivery' && !env.DISPATCH_PRIVATE_KEYS)
    throw Error('Falta DISPATCH_PRIVATE_KEYS.');
  dispatchSettings(env, mode === 'delivery');
  if (mode !== 'http' && !/^[a-f0-9]{64}$/.test(env.GROUP_CONTEXT_SECRET || ''))
    throw Error('GROUP_CONTEXT_SECRET requiere 32 bytes hexadecimales en el componente privado.');
  if (mode === 'identity' && (!env.AUTH_CHALLENGE_SECRET || env.AUTH_CHALLENGE_SECRET.length < 32))
    throw Error('AUTH_CHALLENGE_SECRET requiere al menos 32 caracteres.');
  if (mode === 'http') internalOrigin(env.IDENTITY_URL, 'IDENTITY_URL');
  if (mode !== 'delivery') internalOrigin(env.DELIVERY_URL, 'DELIVERY_URL');
  if (!env.DELIVERY_WAKE_TOKEN || env.DELIVERY_WAKE_TOKEN.length < 32)
    throw Error('Falta DELIVERY_WAKE_TOKEN aleatorio.');
}
export function internalOrigin(value: string | undefined, name: string) {
  let url: URL;
  try {
    url = new URL(value || '');
  } catch {
    throw Error(`${name} debe ser un origen interno.`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      url.hostname.endsWith('.railway.internal') ||
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
  )
    throw Error(`${name} debe ser un origen interno.`);
  return url.origin;
}
