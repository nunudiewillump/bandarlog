// Loaded explicitly by the isolated PostgreSQL fixture, never by application startup.
import { generateKeyPairSync, sign } from 'node:crypto';
if (
  process.env.SYNTHETIC_GOOGLE_PROVIDER !== '1' ||
  !process.send ||
  process.env.GOOGLE_LOGIN_CLIENT_ID !== 'synthetic-google-client' ||
  process.env.GOOGLE_LOGIN_CLIENT_SECRET !== 'synthetic-google-secret'
)
  throw Error('Synthetic Google fixture requires its isolated test process');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'synthetic-google-key';
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://www.googleapis.com/oauth2/v3/certs')
    return Response.json({
      keys: [{ ...publicKey.export({ format: 'jwk' }), kid, kty: 'RSA', alg: 'RS256', use: 'sig' }],
    });
  if (url === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(String(init?.body || ''));
    if (
      form.get('client_id') !== 'synthetic-google-client' ||
      form.get('client_secret') !== 'synthetic-google-secret'
    )
      throw Error('Unexpected synthetic OAuth credentials');
    const code = form.get('code') || '';
    if (!code.startsWith('synthetic.'))
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    const claims = JSON.parse(Buffer.from(code.slice(10), 'base64url').toString());
    const encoded = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const payload = encoded({
      iss: 'https://accounts.google.com',
      aud: 'synthetic-google-client',
      exp: Math.floor(Date.now() / 1000) + 120,
      iat: Math.floor(Date.now() / 1000),
      email_verified: true,
      ...claims,
    });
    const text = encoded({ alg: 'RS256', kid, typ: 'JWT' }) + '.' + payload;
    return Response.json({
      id_token:
        text + '.' + sign('RSA-SHA256', Buffer.from(text), privateKey).toString('base64url'),
    });
  }
  const target = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
    throw Error('External network forbidden in synthetic Google fixture');
  return original(input, init);
};
