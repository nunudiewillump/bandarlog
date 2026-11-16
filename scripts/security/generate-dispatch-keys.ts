import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
// Operator-only. Never print key material, accept passwords as CLI flags, or write into the repository.
const destination = process.env.SECURITY_KEY_OUTPUT_DIR;
if (!destination) throw Error('Configura SECURITY_KEY_OUTPUT_DIR fuera del repositorio.');
const output = resolve(destination),
  repo = resolve(process.cwd());
if (output === repo || output.startsWith(repo + sep))
  throw Error('El material de claves debe guardarse fuera del repositorio.');
await mkdir(output, { mode: 0o700 });
const id = 'dispatch_' + randomBytes(6).toString('hex');
const keys = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
await writeFile(resolve(output, 'public.pem'), keys.publicKey, { mode: 0o600, flag: 'wx' });
await writeFile(
  resolve(output, 'private-keyring.json'),
  JSON.stringify({ [id]: keys.privateKey }),
  { mode: 0o600, flag: 'wx' },
);
await writeFile(resolve(output, 'key-id.txt'), id, { mode: 0o600, flag: 'wx' });
console.info(
  'Claves creadas en el directorio protegido. Importe la privada solo en el emisor y en la copia de seguridad de secretos.',
);
