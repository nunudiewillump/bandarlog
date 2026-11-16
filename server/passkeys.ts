import { modernSession, sessionCookieName } from './session-cookie.js';
import type { Express, Request, Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { randomBytes, createHash } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { groupContext, groupPath } from './group-context.js';
import { sessionContext } from './session-context.js';
import { component } from './components.js';
import { equalSecret } from './auth-security.js';
import { identityProof } from './identity-proof.js';
import * as s from './schema.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const now = () => new Date().toISOString();
const base64 = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const responseBody = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    response: z
      .object({
        id: base64.max(1400),
        rawId: base64.max(1400),
        type: z.literal('public-key'),
        response: z
          .object({
            clientDataJSON: base64.max(6000),
            attestationObject: base64.max(180000).optional(),
            authenticatorData: base64.max(6000).optional(),
            signature: base64.max(2000).optional(),
            userHandle: base64.max(1400).nullable().optional(),
            transports: z.array(z.string().max(32)).max(8).optional(),
          })
          .passthrough(),
        clientExtensionResults: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
  })
  .strict();
type Actor = {
  id: string;
  groupId: string;
  sessionId: string;
  name: string;
  email: string;
  csrf: string;
  assurance: string;
  createdAt: string;
  primaryVerifiedAt: string | null;
  mfaVerifiedAt: string | null;
};
type Dependencies = {
  db: any;
  appUrl: string;
  legacyGroupId: string;
  legacyOrigins: string[];
  createSession: (
    tx: any,
    userId: string,
    assurance: 'mfa',
    primaryVerifiedAt?: string,
  ) => Promise<{ raw: string; csrf: string }>;
  cookie: (r: Response, raw: string) => void;
  notify: (tx: any, actor: Actor, action: string) => Promise<void>;
  fail: (status: number, message: string) => never;
};
export function passkeyRoutes(
  app: Express,
  { db, appUrl, legacyGroupId, legacyOrigins, createSession, cookie, notify, fail }: Dependencies,
) {
  const actor = async (tx: any, lock = false): Promise<Actor> => {
    const raw = sessionContext.getStore();
    if (!raw) fail(401, 'Vuelve a iniciar sesión con tu correo o Google.');
    try {
      return (await tx.execute(sql`select bandarlog_api.passkey_actor(${raw},${lock}) as value`))
        .rows[0].value;
    } catch (error: any) {
      if ((error.code || error.cause?.code) === '42501')
        fail(401, 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
      throw error;
    }
  };
  const fresh = (a: Actor) =>
    a.assurance === 'mfa' ||
    (a.assurance === 'primary' && +new Date(a.primaryVerifiedAt || 0) > Date.now() - 10 * 60000);
  const recent = (a: Actor) =>
    a.assurance === 'mfa' && +new Date(a.mfaVerifiedAt || 0) > Date.now() - 15 * 60000;
  const origin = (q: Request) => {
    const value = q.get('origin') || appUrl;
    if (
      value !== appUrl &&
      !(groupContext.getStore()!.id === legacyGroupId && legacyOrigins.includes(value))
    )
      fail(403, 'Origen no permitido.');
    return value;
  };
  const check = (q: Request, a: Actor) => {
    if (process.env.NODE_ENV === 'production' && !modernSession(q.headers.cookie))
      fail(401, 'Vuelve a entrar con tu correo o Google.');
    origin(q);
    if (!equalSecret(q.get('X-CSRF-Token') || '', a.csrf))
      fail(403, 'La sesión de seguridad ha cambiado. Recarga la página.');
  };
  const issue = async (tx: any, table: any, values: any, ignore = false) => {
    await identityProof(
      tx,
      table === s.passkeyAccounts
        ? 'passkey_accounts'
        : table === s.passkeys
          ? 'passkeys'
          : table === s.passkeyChallenges
            ? 'passkey_challenges'
            : 'passkey_recovery',
      values,
    );
    const insert = tx.insert(table).values(values);
    return ignore ? insert.onConflictDoNothing() : insert;
  };
  const recoveries = async (tx: any, a: Actor) => {
    await tx.execute(sql`select bandarlog_api.clear_recovery(${sessionContext.getStore()})`);
    const codes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
    for (const code of codes)
      await issue(tx, s.passkeyRecovery, {
        groupId: a.groupId,
        userId: a.id,
        id: hash(code),
        createdAt: now(),
      });
    return codes;
  };
  const audit = async (tx: any, a: Actor, action: string) => {
    await identityProof(tx, 'passkey_audit', { userId: a.id, action });
    await tx.execute(sql`select bandarlog_api.record_passkey_event(${action})`);
    if (action !== 'passkey.verified') await notify(tx, a, action);
  };
  app.post('/api/auth/passkeys/logout', async (q, r) => {
    const a = await actor(db);
    check(q, a);
    await db.execute(sql`select bandarlog_api.rotate_session(${sessionContext.getStore()})`);
    r.clearCookie(sessionCookieName(), {
      path: process.env.NODE_ENV === 'production' ? '/' : groupPath() || '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    });
    r.clearCookie('bandarlog', { path: groupPath() || '/' });
    if (groupContext.getStore()!.id === legacyGroupId) r.clearCookie('bandarlog', { path: '/' });
    r.json({ ok: true });
  });
  app.get('/api/auth/passkeys/status', async (q, r) => {
    if (component() === 'development') return r.json({ required: false });
    const a = await actor(db);
    const registered = await db
      .select({ id: s.passkeys.id, rpId: s.passkeys.rpId })
      .from(s.passkeys)
      .where(eq(s.passkeys.userId, a.id));
    r.json({
      required:
        a.assurance !== 'mfa' ||
        (process.env.NODE_ENV === 'production' && !modernSession(q.headers.cookie)),
      reauthenticate:
        !fresh(a) || (process.env.NODE_ENV === 'production' && !modernSession(q.headers.cookie)),
      hasPasskeys: registered.length > 0,
      csrf: a.csrf,
    });
  });
  async function options(q: Request, r: Response, purpose: 'register' | 'authenticate') {
    const result = await db.transaction(async (tx: any) => {
      const a = await actor(tx, true);
      check(q, a);
      if (!fresh(a)) fail(401, 'Vuelve a iniciar sesión con tu correo o Google.');
      const expectedOrigin = origin(q),
        rpID = new URL(expectedOrigin).hostname;
      const keys = await tx
        .select()
        .from(s.passkeys)
        .where(and(eq(s.passkeys.userId, a.id), eq(s.passkeys.rpId, rpID)));
      if (purpose === 'register' && keys.length && !recent(a))
        fail(428, 'Verifica tu passkey antes de añadir otra.');
      if (purpose === 'register' && keys.length >= 10)
        fail(409, 'Ya tienes diez passkeys. Retira una antes de añadir otra.');
      if (purpose === 'authenticate' && !keys.length)
        fail(
          409,
          'No hay una passkey de este dominio. Usa un código de recuperación o vuelve al dominio donde la registraste.',
        );
      let [account] = await tx
        .select()
        .from(s.passkeyAccounts)
        .where(eq(s.passkeyAccounts.userId, a.id));
      if (!account) {
        await issue(
          tx,
          s.passkeyAccounts,
          { groupId: a.groupId, userId: a.id, webauthnId: randomBytes(32).toString('base64url') },
          true,
        );
        [account] = await tx
          .select()
          .from(s.passkeyAccounts)
          .where(eq(s.passkeyAccounts.userId, a.id));
      }
      await tx
        .delete(s.passkeyChallenges)
        .where(
          and(eq(s.passkeyChallenges.userId, a.id), sql`${s.passkeyChallenges.expires}<=now()`),
        );
      const active = await tx
        .select({ id: s.passkeyChallenges.id })
        .from(s.passkeyChallenges)
        .where(
          and(
            eq(s.passkeyChallenges.sessionId, a.sessionId),
            sql`${s.passkeyChallenges.expires}>now()`,
          ),
        );
      if (active.length >= 5) fail(429, 'Espera unos minutos antes de iniciar otro intento.');
      const credentials = keys.map((key: any) => ({
        id: key.id,
        transports: JSON.parse(key.transports),
      }));
      const options =
        purpose === 'register'
          ? await generateRegistrationOptions({
              rpName: 'Bandarlog',
              rpID,
              userName: a.email,
              userDisplayName: a.name + ' · ' + groupContext.getStore()!.name,
              userID: new Uint8Array(Buffer.from(account.webauthnId, 'base64url')),
              attestationType: 'none',
              excludeCredentials: credentials,
              authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
              supportedAlgorithmIDs: [-7],
            })
          : await generateAuthenticationOptions({
              rpID,
              userVerification: 'required',
              allowCredentials: credentials,
            });
      const id = random();
      await issue(tx, s.passkeyChallenges, {
        groupId: a.groupId,
        userId: a.id,
        id: hash(id),
        sessionId: a.sessionId,
        challenge: options.challenge,
        origin: expectedOrigin,
        rpId: rpID,
        purpose,
        expires: new Date(Date.now() + 5 * 60000).toISOString(),
      });
      return { id, options };
    });
    r.json(result);
  }
  app.post('/api/auth/passkeys/register/options', (q, r) => options(q, r, 'register'));
  app.post('/api/auth/passkeys/authenticate/options', (q, r) => options(q, r, 'authenticate'));
  async function verify(q: Request, r: Response, purpose: 'register' | 'authenticate') {
    const input = responseBody.parse(q.body);
    const result = await db.transaction(async (tx: any) => {
      const a = await actor(tx, true);
      check(q, a);
      if (!fresh(a)) fail(401, 'Vuelve a iniciar sesión con tu correo o Google.');
      const [challenge] = await tx
        .delete(s.passkeyChallenges)
        .where(
          and(
            eq(s.passkeyChallenges.id, hash(input.id)),
            eq(s.passkeyChallenges.sessionId, a.sessionId),
            eq(s.passkeyChallenges.userId, a.id),
            eq(s.passkeyChallenges.purpose, purpose),
            eq(s.passkeyChallenges.origin, origin(q)),
            sql`${s.passkeyChallenges.expires}>now()`,
          ),
        )
        .returning();
      if (!challenge) return { error: true };
      try {
        if (purpose === 'register') {
          const existing = await tx
            .select({ id: s.passkeys.id })
            .from(s.passkeys)
            .where(eq(s.passkeys.userId, a.id));
          if (existing.length && !recent(a)) return { error: true };
          const verified = await verifyRegistrationResponse({
            response: input.response as any,
            expectedChallenge: challenge.challenge,
            expectedOrigin: challenge.origin,
            expectedRPID: challenge.rpId,
            requireUserVerification: true,
            requireUserPresence: true,
            supportedAlgorithmIDs: [-7],
          });
          if (!verified.verified || !verified.registrationInfo.userVerified) return { error: true };
          const info = verified.registrationInfo;
          await issue(tx, s.passkeys, {
            groupId: a.groupId,
            userId: a.id,
            id: info.credential.id,
            publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
            counter: info.credential.counter,
            rpId: challenge.rpId,
            transports: JSON.stringify(info.credential.transports || []),
            deviceType: info.credentialDeviceType,
            backedUp: info.credentialBackedUp,
            name: 'Passkey ' + (existing.length + 1),
            createdAt: now(),
          });
          const codes = existing.length ? undefined : await recoveries(tx, a);
          await audit(tx, a, 'passkey.registered');
          return {
            session: await createSession(tx, a.id, 'mfa', a.primaryVerifiedAt || a.createdAt),
            codes,
          };
        }
        const [key] = await tx
          .select()
          .from(s.passkeys)
          .where(
            and(
              eq(s.passkeys.id, input.response.id),
              eq(s.passkeys.userId, a.id),
              eq(s.passkeys.rpId, challenge.rpId),
            ),
          )
          .for('update');
        if (!key) return { error: true };
        const verified = await verifyAuthenticationResponse({
          response: input.response as any,
          expectedChallenge: challenge.challenge,
          expectedOrigin: challenge.origin,
          expectedRPID: challenge.rpId,
          requireUserVerification: true,
          credential: {
            id: key.id,
            publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64url')),
            counter: key.counter,
            transports: JSON.parse(key.transports),
          },
        });
        if (!verified.verified || !verified.authenticationInfo.userVerified) return { error: true };
        const update = {
          id: key.id,
          counter: verified.authenticationInfo.newCounter,
          lastUsedAt: now(),
        };
        await identityProof(tx, 'passkeys_update', update);
        await tx
          .update(s.passkeys)
          .set({ counter: update.counter, lastUsedAt: update.lastUsedAt })
          .where(eq(s.passkeys.id, key.id));
        await audit(tx, a, 'passkey.verified');
        return {
          session: await createSession(tx, a.id, 'mfa', a.primaryVerifiedAt || a.createdAt),
        };
      } catch (error: any) {
        if (error?.code || error?.cause?.code) throw error;
        return { error: true };
      }
    });
    if (result.error) fail(403, 'No se pudo verificar la passkey. Inicia un intento nuevo.');
    cookie(r, result.session!.raw);
    r.json({ ok: true, recoveryCodes: result.codes, csrf: result.session!.csrf });
  }
  app.post('/api/auth/passkeys/register/verify', (q, r) => verify(q, r, 'register'));
  app.post('/api/auth/passkeys/authenticate/verify', (q, r) => verify(q, r, 'authenticate'));
  app.post('/api/auth/passkeys/recovery/verify', async (q, r) => {
    const { code } = z
      .object({ code: z.string().regex(/^[a-f0-9]{32}$/) })
      .strict()
      .parse(q.body);
    const result = await db.transaction(async (tx: any) => {
      const a = await actor(tx, true);
      check(q, a);
      if (a.assurance !== 'primary' || !fresh(a))
        fail(401, 'Inicia sesión primero con tu correo o Google.');
      const used = await tx.execute(
        sql`select bandarlog_api.consume_recovery(${sessionContext.getStore()},${code}) as ok`,
      );
      if (!used.rows[0]?.ok) return null;
      await audit(tx, a, 'passkey.recovery.used');
      return createSession(tx, a.id, 'mfa', a.primaryVerifiedAt!);
    });
    if (!result) fail(403, 'El código de recuperación no es válido o ya se ha utilizado.');
    cookie(r, result.raw);
    r.json({ ok: true, csrf: result.csrf });
  });
  app.post('/api/auth/passkeys/recovery/new', async (q, r) => {
    const codes = await db.transaction(async (tx: any) => {
      const a = await actor(tx, true);
      check(q, a);
      if (!recent(a)) fail(428, 'Verifica tu passkey antes de generar códigos de recuperación.');
      const codes = await recoveries(tx, a);
      await audit(tx, a, 'passkey.recovery.rotated');
      return codes;
    });
    r.json({ codes });
  });
  app.get('/api/auth/passkeys/list', async (_q, r) => {
    const a = await actor(db);
    if (a.assurance !== 'mfa') fail(403, 'Verifica primero tu passkey.');
    r.json(
      await db
        .select({
          id: s.passkeys.id,
          name: s.passkeys.name,
          rpId: s.passkeys.rpId,
          createdAt: s.passkeys.createdAt,
          lastUsedAt: s.passkeys.lastUsedAt,
        })
        .from(s.passkeys)
        .where(eq(s.passkeys.userId, a.id)),
    );
  });
  app.post('/api/auth/passkeys/remove', async (q, r) => {
    const { id } = z
      .object({ id: base64.max(1400) })
      .strict()
      .parse(q.body);
    await db.transaction(async (tx: any) => {
      const a = await actor(tx, true);
      check(q, a);
      if (!recent(a)) fail(428, 'Verifica tu passkey antes de retirar otra.');
      const keys = await tx
        .select({ id: s.passkeys.id })
        .from(s.passkeys)
        .where(eq(s.passkeys.userId, a.id));
      if (keys.length < 2) fail(409, 'Añade otra passkey antes de retirar la última.');
      await tx.execute(
        sql`select bandarlog_api.remove_passkey(${sessionContext.getStore()},${id})`,
      );
      await audit(tx, a, 'passkey.removed');
    });
    r.json({ ok: true });
  });
}
