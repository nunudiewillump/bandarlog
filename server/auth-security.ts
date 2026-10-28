import { createHmac, timingSafeEqual, createPublicKey, verify } from 'node:crypto';
export const CODE_LIFETIME = 10 * 60000;
export const SESSION_IDLE = 30 * 86400000;
export const SESSION_ABSOLUTE = 90 * 86400000;
export const SESSION_RENEW_INTERVAL = 86400000;
export function codeVerifier(secret: string, challenge: string, email: string, code: string) {
  return createHmac('sha256', secret)
    .update(JSON.stringify([challenge, email, code]))
    .digest('hex');
}
export function equalSecret(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function sessionDeadline(absolute: string, time = Date.now()) {
  return new Date(Math.min(time + SESSION_IDLE, +new Date(absolute))).toISOString();
}
export function googleEmailAuthoritative(claims: {
  email: string;
  email_verified: boolean;
  hd?: string;
}) {
  const domain = claims.email.toLowerCase().split('@')[1];
  return (
    claims.email_verified &&
    (domain === 'gmail.com' || (!!claims.hd && claims.hd.toLowerCase() === domain))
  );
}
export type GoogleClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  hd?: string;
  nonce: string;
};
/** Validate the ID token locally against Google's signing keys; never trust client-decoded claims. */
export function verifyGoogleToken(
  token: string,
  keys: JsonWebKey[],
  audience: string,
  nonce: string,
  time = Date.now(),
): GoogleClaims {
  if (token.length > 20000) throw new Error('Invalid Google token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid Google token');
  const [headerPart, bodyPart, signature] = parts;
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
  if (header.alg !== 'RS256' || typeof header.kid !== 'string')
    throw new Error('Invalid Google token algorithm');
  const key = keys.find(
    (k: any) =>
      k.kid === header.kid &&
      k.kty === 'RSA' &&
      (!k.use || k.use === 'sig') &&
      (!k.alg || k.alg === 'RS256'),
  );
  if (
    !key ||
    !verify(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${bodyPart}`),
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(signature, 'base64url'),
    )
  )
    throw new Error('Invalid Google signature');
  const claims = JSON.parse(Buffer.from(bodyPart, 'base64url').toString());
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    !aud.includes(audience) ||
    (aud.length > 1 && claims.azp !== audience) ||
    (claims.azp && claims.azp !== audience) ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 <= time ||
    typeof claims.iat !== 'number' ||
    claims.iat * 1000 > time + 300000 ||
    typeof claims.nonce !== 'string' ||
    !equalSecret(claims.nonce, nonce) ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    claims.sub.length > 255 ||
    typeof claims.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email.length > 254 ||
    claims.email_verified !== true ||
    (claims.hd !== undefined && typeof claims.hd !== 'string')
  )
    throw new Error('Invalid Google claims');
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    email_verified: true,
    hd: claims.hd,
    nonce: claims.nonce,
  };
}
