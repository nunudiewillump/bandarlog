import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { syntheticPasskey } from './fixtures/webauthn';
test('passkeys require the correct origin, challenge, RP, signature, user verification and monotonic counter', async () => {
  const key = syntheticPasskey(),
    options = await generateRegistrationOptions({
      rpName: 'Bandarlog',
      rpID: 'bandarlog.app',
      userName: 'synthetic@example.test',
      authenticatorSelection: { userVerification: 'required' },
      supportedAlgorithmIDs: [-7],
    });
  const check = async (response: any) =>
    verifyRegistrationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: 'https://bandarlog.app',
      expectedRPID: 'bandarlog.app',
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7],
    });
  await assert.rejects(check(key.register(options, { origin: 'https://attacker.example' })));
  await assert.rejects(check(key.register(options, { challenge: 'wrong' })));
  await assert.rejects(check(key.register(options, { uv: false })));
  const registered = await check(key.register(options));
  assert.equal(registered.verified, true);
  if (!registered.verified) throw Error();
  const get = await generateAuthenticationOptions({
    rpID: 'bandarlog.app',
    userVerification: 'required',
  });
  const verify = async (response: any, counter = 0) =>
    verifyAuthenticationResponse({
      response,
      expectedChallenge: get.challenge,
      expectedOrigin: 'https://bandarlog.app',
      expectedRPID: 'bandarlog.app',
      requireUserVerification: true,
      credential: { ...registered.registrationInfo.credential, counter },
    });
  await assert.rejects(verify(key.authenticate(get, { uv: false })));
  await assert.rejects(verify(key.authenticate(get, { origin: 'https://attacker.example' })));
  await assert.rejects(verify(key.authenticate({ ...get, rpId: 'other.example' })));
  await assert.rejects(verify(key.authenticate(get, { challenge: 'wrong' })));
  const good = key.authenticate(get, { signCount: 5 });
  assert.equal((await verify(good)).verified, true);
  await assert.rejects(verify(good, 5));
  const wrong = syntheticPasskey().authenticate(get);
  wrong.id = key.id;
  await assert.rejects(verify(wrong));
});
