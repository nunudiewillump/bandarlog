import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { sealMail, openMail } from '../server/dispatch-envelope';
const pair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
test('only the sender private key decrypts credential mail; tampering and wrong key IDs fail closed', () => {
  const a = pair(),
    b = pair(),
    content = {
      subject: 'Synthetic',
      body: 'code=123456; token=synthetic-only',
      html: '<p>synthetic-only</p>',
    };
  const sealed = sealMail(content, a.publicKey, 'rotation_a');
  assert.ok(!sealed.includes(content.body));
  assert.deepEqual(openMail(sealed, { rotation_a: a.privateKey }), content);
  assert.throws(() => openMail(sealed, { rotation_a: b.privateKey }));
  assert.throws(() => openMail(sealed, { rotation_b: a.privateKey }));
  assert.throws(() => openMail(sealed, { rotation_a: a.publicKey }));
  const envelope = JSON.parse(sealed.slice('bandarlog-sealed-v1:'.length));
  envelope.data = Buffer.from('tampered').toString('base64');
  assert.throws(() =>
    openMail('bandarlog-sealed-v1:' + JSON.stringify(envelope), { rotation_a: a.privateKey }),
  );
  const rotated = sealMail(content, b.publicKey, 'rotation_b');
  assert.deepEqual(
    openMail(sealed, { rotation_a: a.privateKey, rotation_b: b.privateKey }),
    content,
  );
  assert.deepEqual(
    openMail(rotated, { rotation_a: a.privateKey, rotation_b: b.privateKey }),
    content,
  );
  assert.throws(() => openMail(content.body, { rotation_a: a.privateKey }));
  assert.equal(createPublicKey(a.publicKey).asymmetricKeyDetails?.modulusLength, 3072);
});
