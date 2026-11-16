import { component } from './components.js';
import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { groupContext, type Group } from './group-context.js';

function camel(value: any): any {
  if (Array.isArray(value)) return value.map(camel);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        camel(v),
      ]),
    );
  return value;
}
/** Each method corresponds to a database capability, never arbitrary global SQL. */
export function globalOperations(connection: any, scoped: any) {
  async function execute(query: any) {
    try {
      return await connection.execute(query);
    } catch (cause: any) {
      // Drizzle errors carry SQL parameters, including bearer tokens and VAPID keys.
      const error = new Error('No se pudo completar la operación global.');
      Object.assign(error, {
        code: cause?.code || cause?.cause?.code || 'GLOBAL_OPERATION_FAILED',
      });
      throw error;
    }
  }
  async function one(query: any) {
    const result = await execute(query);
    return camel(result.rows[0]?.value ?? null);
  }
  async function many(query: any) {
    const result = await execute(query);
    return result.rows.map((r: any) => camel(r.value));
  }
  return {
    registerDispatchKey: (id: string, fingerprint: string) =>
      one(sql`select bandarlog_api.register_dispatch_key(${id},${fingerprint}) as value`),
    dispatchKeyFingerprint: (id: string): Promise<string | null> =>
      one(sql`select bandarlog_api.dispatch_key_fingerprint(${id}) as value`),
    resolveGroup: (key: string): Promise<Group | null> =>
      one(sql`select bandarlog_api.resolve_group(${key}) as value`),
    oauthGroup: (hash: string): Promise<Group | null> =>
      one(sql`select bandarlog_api.oauth_group(${hash}) as value`),
    entryGroup: (hash: string, privateId: string, legacy: boolean): Promise<string | null> =>
      one(sql`select bandarlog_api.entry_group(${hash},${privateId},${legacy}) as value`),
    jobGroups: (pending: boolean, mail: boolean): Promise<Group[]> =>
      many(sql`select bandarlog_api.job_groups(${pending},${mail}) as value`),
    async updateGroup(
      actor: string,
      input: { name: string; colorPrimary: string; colorSecondary: string },
    ) {
      if (!groupContext.getStore()) throw Error('Falta el contexto privado del grupo.');
      await scoped.execute(
        sql`select bandarlog_api.update_group(${actor},${input.name},${input.colorPrimary},${input.colorSecondary})`,
      );
    },
    publicPushKey: (): Promise<string | null> =>
      one(sql`select bandarlog_api.public_push_key() as value`),
    pushKeys: (publicKey: string, privateKey: string) =>
      one(sql`select bandarlog_api.push_keys(${publicKey},${privateKey}) as value`),
    requestGroup: (hash: string, input: unknown, mail: unknown) => {
      const inputJson = JSON.stringify(input),
        mailJson = JSON.stringify(mail);
      if (component() !== 'identity')
        return one(
          sql`select bandarlog_api.request_group(${hash},${inputJson}::jsonb,${mailJson}::jsonb) as value`,
        );
      const deadline = Date.now() + 30000;
      const proof = createHmac('sha256', Buffer.from(process.env.GROUP_CONTEXT_SECRET!, 'hex'))
        .update(['registration-v2', hash, String(deadline), inputJson, mailJson].join('\n'))
        .digest('hex');
      return one(
        sql`select bandarlog_api.request_group_proof_v2(${hash},${inputJson},${mailJson},${deadline},${proof}) as value`,
      );
    },
    registration: (hash: string) =>
      one(
        component() === 'identity'
          ? sql`select bandarlog_api.registration_proof(${hash}) as value`
          : sql`select bandarlog_api.registration(${hash}) as value`,
      ),
    reviewGroup: (
      hash: string,
      decision: string,
      activation: string,
      mail: unknown,
    ): Promise<boolean> =>
      one(
        component() === 'identity'
          ? sql`select bandarlog_api.review_group_proof(${hash},${decision},${activation},${JSON.stringify(mail)}::jsonb) as value`
          : sql`select bandarlog_api.review_group(${hash},${decision},${activation},${JSON.stringify(mail)}::jsonb) as value`,
      ),
    activateGroup: (hash: string, session: string, csrf: string): Promise<Group | null> =>
      one(
        component() === 'identity'
          ? sql`select bandarlog_api.activate_group_proof(${hash},${session},${csrf}) as value`
          : sql`select bandarlog_api.activate_group(${hash},${session},${csrf}) as value`,
      ),
    refreshPlatformLease: (id: string, lease: string): Promise<boolean> =>
      one(sql`select bandarlog_api.refresh_platform_lease(${id},${lease}) as value`),
    claimPlatformMail: () =>
      many(
        component() === 'delivery'
          ? sql`select bandarlog_api.claim_platform_mail_v2() as value`
          : sql`select bandarlog_api.claim_platform_mail() as value`,
      ),
    finishPlatformMail: (id: string, result: unknown, lease?: string) =>
      one(
        component() === 'delivery'
          ? sql`select bandarlog_api.finish_platform_mail_v2(${id},${lease},${JSON.stringify(result)}::jsonb) as value`
          : sql`select bandarlog_api.finish_platform_mail(${id},${JSON.stringify(result)}::jsonb) as value`,
      ),
    platformNext: (): Promise<string | null> =>
      one(
        component() === 'delivery'
          ? sql`select bandarlog_api.platform_next_v2() as value`
          : sql`select bandarlog_api.platform_next() as value`,
      ),
    health: () => connection.execute(sql`select 1`),
  };
}
export type GlobalOperations = ReturnType<typeof globalOperations>;
