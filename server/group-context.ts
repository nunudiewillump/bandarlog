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
export const groupUrl = (origin: string) => origin + groupPath() + '/';
const activate = async (client: any, group: Group) => {
  await client.query("select set_config('bandarlog.group_id', $1, true)", [group.id]);
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
          try {
            await client.query('begin');
            await activate(client, group);
            const result = await client.query(...args);
            await client.query('commit');
            return result;
          } catch (error) {
            await client.query('rollback');
            throw error;
          } finally {
            client.release();
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
          let released = false;
          return new Proxy(client, {
            get(connection, property) {
              if (property === 'release')
                return () => {
                  if (!released) {
                    released = true;
                    connection.release();
                  }
                };
              if (property === 'query')
                return async (...args: any[]) => {
                  const result = await connection.query(...args);
                  const query = typeof args[0] === 'string' ? args[0] : args[0]?.text;
                  if (group && /^begin\b/i.test(query || '')) {
                    try {
                      await activate(connection, group);
                    } catch (error) {
                      await connection.query('rollback');
                      if (!released) {
                        released = true;
                        connection.release();
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
