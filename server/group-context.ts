import { createHmac } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
export type Group = {
  id: string;
  privateId: string;
  name: string;
  colorPrimary: string;
  colorSecondary: string;
  plan: string;
  legacyAccess?: boolean;
};
export const groupContext = new AsyncLocalStorage<Group>();
export const groupPath = () =>
  groupContext.getStore() && !groupContext.getStore()!.legacyAccess
    ? `/g/${groupContext.getStore()!.privateId}`
    : '';
export const canonicalGroupPath = () => {
  const group = groupContext.getStore();
  return group ? `/g/${group.privateId}` : '';
};
export const groupUrl = (origin: string) => origin + canonicalGroupPath() + '/';
let contextSecret: string | undefined;
export function configureGroupSigning(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw Error('GROUP_CONTEXT_SECRET debe tener 32 bytes hexadecimales.');
  contextSecret = secret;
}
const activate = async (client: any, group: Group) => {
  if (!group.id) throw new Error('Falta el contexto privado del grupo.');
  const key = contextSecret || process.env.GROUP_CONTEXT_SECRET;
  if (!key) throw Error('Falta GROUP_CONTEXT_SECRET.');
  const deadline = String(Math.floor(Date.now() / 1000) + 300);
  const proof = createHmac('sha256', Buffer.from(key, 'hex'))
    .update(group.id + '\n' + deadline)
    .digest('hex');
  await client.query(
    "select set_config('bandarlog.group_id',$1,true),set_config('bandarlog.context_deadline',$2,true),set_config('bandarlog.context_proof',$3,true)",
    [group.id, deadline, proof],
  );
  // The API role is not the table owner and cannot bypass the RLS policies.
  await client.query('set local role bandarlog_group_app');
};
export function scopedPglite(client: any) {
  return new Proxy(client, {
    get(target, key) {
      if (key === 'query')
        return async (...args: any[]) => {
          const group = groupContext.getStore();
          if (!group) throw new Error('Falta el contexto privado del grupo.');
          return target.transaction(async (tx: any) => {
            await activate(tx, group);
            return tx.query(...args);
          });
        };
      if (key === 'transaction')
        return async (fn: any) =>
          target.transaction(async (tx: any) => {
            const group = groupContext.getStore();
            if (!group) throw new Error('Falta el contexto privado del grupo.');
            await activate(tx, group);
            return fn(tx);
          });
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
export function scopedPool(pool: any) {
  return new Proxy(pool, {
    get(target, key) {
      if (key === 'query')
        return async (...args: any[]) => {
          const group = groupContext.getStore();
          if (!group) throw new Error('Falta el contexto privado del grupo.');
          const client = await target.connect();
          let discard = false;
          try {
            await client.query('begin');
            await activate(client, group);
            const result = await client.query(...args);
            await client.query('commit');
            return result;
          } catch (error) {
            try {
              await client.query('rollback');
            } catch {
              discard = true;
            }
            throw error;
          } finally {
            client.release(discard);
          }
        };
      if (key === 'connect')
        return async () => {
          const client = await target.connect(),
            group = groupContext.getStore();
          if (!group) {
            client.release();
            throw new Error('Falta el contexto privado del grupo.');
          }
          let released = false,
            inTransaction = false,
            broken = false;
          return new Proxy(client, {
            get(connection, property) {
              if (property === 'release')
                return () => {
                  if (!released) {
                    released = true;
                    connection.release(inTransaction || broken);
                  }
                };
              if (property === 'query')
                return async (...args: any[]) => {
                  if (released) throw Error('Conexión ya devuelta al pool.');
                  const query = typeof args[0] === 'string' ? args[0] : args[0]?.text;
                  if (/^begin\b/i.test(query || '')) inTransaction = true;
                  let result;
                  try {
                    result = await connection.query(...args);
                  } catch (error) {
                    broken = true;
                    throw error;
                  }
                  if (/^(commit|rollback)\b/i.test(query || '')) {
                    inTransaction = false;
                    broken = false;
                  }
                  if (group && /^begin\b/i.test(query || '')) {
                    try {
                      await activate(connection, group);
                    } catch (error) {
                      try {
                        await connection.query('rollback');
                        inTransaction = false;
                      } catch {
                        broken = true;
                      }
                      if (!released) {
                        released = true;
                        connection.release(inTransaction || broken);
                      }
                      throw error;
                    }
                  }
                  return result;
                };
              const value = Reflect.get(connection, property, connection);
              return typeof value === 'function' ? value.bind(connection) : value;
            },
          });
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' && key !== 'constructor' ? value.bind(target) : value;
    },
  });
}
