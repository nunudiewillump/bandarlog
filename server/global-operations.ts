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
    pushKeys: (publicKey: string, privateKey: string) =>
      one(sql`select bandarlog_api.push_keys(${publicKey},${privateKey}) as value`),
    requestGroup: (hash: string, input: unknown, mail: unknown) =>
      one(
        sql`select bandarlog_api.request_group(${hash},${JSON.stringify(input)}::jsonb,${JSON.stringify(mail)}::jsonb) as value`,
      ),
    registration: (hash: string) => one(sql`select bandarlog_api.registration(${hash}) as value`),
    reviewGroup: (
      hash: string,
      decision: string,
      activation: string,
      mail: unknown,
    ): Promise<boolean> =>
      one(
        sql`select bandarlog_api.review_group(${hash},${decision},${activation},${JSON.stringify(mail)}::jsonb) as value`,
      ),
    activateGroup: (hash: string, session: string, csrf: string): Promise<Group | null> =>
      one(sql`select bandarlog_api.activate_group(${hash},${session},${csrf}) as value`),
    claimPlatformMail: () => many(sql`select bandarlog_api.claim_platform_mail() as value`),
    finishPlatformMail: (id: string, result: unknown) =>
      one(
        sql`select bandarlog_api.finish_platform_mail(${id},${JSON.stringify(result)}::jsonb) as value`,
      ),
    platformNext: (): Promise<string | null> =>
      one(sql`select bandarlog_api.platform_next() as value`),
    health: () => connection.execute(sql`select 1`),
  };
}
export type GlobalOperations = ReturnType<typeof globalOperations>;
