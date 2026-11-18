import { generateKeyPairSync, createHash, randomBytes, sign } from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest();
export function syntheticPasskey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    id = randomBytes(32);
  let counter = 0;
  const jwk = publicKey.export({ format: 'jwk' });
  const cose = encodeCBOR(
    new Map<any, any>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
      [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
    ]),
  );
  return {
    id: id.toString('base64url'),
    register(
      options: any,
      { origin = 'https://bandarlog.app', uv = true, challenge = options.challenge } = {},
    ) {
      const client = Buffer.from(
        JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }),
      );
      const length = Buffer.alloc(2);
      length.writeUInt16BE(id.length);
      const authData = Buffer.concat([
        sha(options.rp.id),
        Buffer.from([uv ? 0x45 : 0x41]),
        Buffer.alloc(4),
        Buffer.alloc(16),
        length,
        id,
        Buffer.from(cose),
      ]);
      const attestation = encodeCBOR(
        new Map<any, any>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', new Uint8Array(authData)],
        ]),
      );
      return {
        id: id.toString('base64url'),
        rawId: id.toString('base64url'),
        type: 'public-key',
        response: {
          clientDataJSON: client.toString('base64url'),
          attestationObject: Buffer.from(attestation).toString('base64url'),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },
    authenticate(
      options: any,
      {
        origin = 'https://bandarlog.app',
        uv = true,
        challenge = options.challenge,
        signCount = ++counter,
      } = {},
    ) {
      const client = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
      );
      const count = Buffer.alloc(4);
      count.writeUInt32BE(signCount);
      const authData = Buffer.concat([sha(options.rpId), Buffer.from([uv ? 0x05 : 0x01]), count]);
      return {
        id: id.toString('base64url'),
        rawId: id.toString('base64url'),
        type: 'public-key',
        response: {
          clientDataJSON: client.toString('base64url'),
          authenticatorData: authData.toString('base64url'),
          signature: sign('sha256', Buffer.concat([authData, sha(client)]), privateKey).toString(
            'base64url',
          ),
          userHandle: null,
        },
        clientExtensionResults: {},
      };
    },
  };
}
