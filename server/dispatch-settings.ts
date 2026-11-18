import { createPublicKey, createPrivateKey } from 'node:crypto';
export function dispatchSettings(env: NodeJS.ProcessEnv = process.env, withPrivate = false) {
  const id = env.DISPATCH_KEY_ID || 'primary';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw Error('DISPATCH_KEY_ID no válido.');
  let publicKey;
  try {
    publicKey = createPublicKey(env.DISPATCH_PUBLIC_KEY!);
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength || 0) < 3072
    )
      throw Error();
  } catch {
    throw Error('DISPATCH_PUBLIC_KEY debe ser una clave RSA de al menos 3072 bits.');
  }
  const fingerprint = publicKey.export({ type: 'spki', format: 'der' });
  if (withPrivate) {
    try {
      const ring = JSON.parse(env.DISPATCH_PRIVATE_KEYS!);
      if (
        !ring ||
        Array.isArray(ring) ||
        typeof ring !== 'object' ||
        Object.keys(ring).length > 20 ||
        !ring[id]
      )
        throw Error();
      for (const [label, value] of Object.entries(ring)) {
        if (!/^[a-zA-Z0-9_-]{1,40}$/.test(label) || typeof value !== 'string') throw Error();
        const key = createPrivateKey(value);
        if (
          key.asymmetricKeyType !== 'rsa' ||
          (key.asymmetricKeyDetails?.modulusLength || 0) < 3072
        )
          throw Error();
      }
      if (
        !createPublicKey(createPrivateKey(ring[id]))
          .export({ type: 'spki', format: 'der' })
          .equals(fingerprint)
      )
        throw Error();
    } catch {
      throw Error(
        'DISPATCH_PRIVATE_KEYS debe contener las claves RSA y corresponder con la pública activa.',
      );
    }
  }
  return { id, fingerprint };
}
