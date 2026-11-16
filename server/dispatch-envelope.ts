import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  constants,
} from 'node:crypto';
const prefix = 'bandarlog-sealed-v1:';
export type MailContent = { subject: string; body: string; html: string };
// RSA-OAEP-SHA256 wraps an independent 256-bit AES-GCM key for each message.
// Public keys cannot decrypt. Key IDs allow overlap during rotation/recovery.
export function sealMail(content: MailContent, publicPem: string, keyId: string) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(keyId)) throw Error('DISPATCH_KEY_ID no válido.');
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 3072)
    throw Error('La clave de envío debe ser RSA de al menos 3072 bits.');
  const secret = randomBytes(32),
    iv = randomBytes(12),
    aad = Buffer.from(prefix + keyId);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(aad);
  const payload = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
  const wrapped = publicEncrypt(
    { key, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    secret,
  );
  return (
    prefix +
    JSON.stringify({
      kid: keyId,
      iv: iv.toString('base64'),
      key: wrapped.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: payload.toString('base64'),
    })
  );
}
export function openMail(body: string, privateKeys: Record<string, string>): MailContent {
  if (!body.startsWith(prefix)) throw Error('El mensaje necesita transición de cifrado.');
  try {
    const envelope = JSON.parse(body.slice(prefix.length)),
      pem = privateKeys[envelope.kid];
    if (!pem) throw Error();
    const key = privateDecrypt(
      { key: createPrivateKey(pem), oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(envelope.key, 'base64'),
    );
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(prefix + envelope.kid));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const value = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    );
    if (!['subject', 'body', 'html'].every((k) => typeof value[k] === 'string')) throw Error();
    return value;
  } catch {
    throw Error('No se pudo descifrar el mensaje.');
  }
}
export function queuedContent(content: MailContent) {
  if (!process.env.DISPATCH_PUBLIC_KEY) return content;
  return {
    subject: content.subject,
    body: sealMail(
      content,
      process.env.DISPATCH_PUBLIC_KEY,
      process.env.DISPATCH_KEY_ID || 'primary',
    ),
    html: '',
  };
}
export function deliveryContent(content: MailContent) {
  return process.env.DISPATCH_PRIVATE_KEYS
    ? openMail(content.body, JSON.parse(process.env.DISPATCH_PRIVATE_KEYS))
    : content;
}
