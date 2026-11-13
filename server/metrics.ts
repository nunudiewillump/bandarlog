import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';

// Opt-in aggregate telemetry. Never retain SQL, parameters, identifiers or bodies.
const enabled =
  process.env.CONSUMPTION_METRICS === '1' ||
  (process.env.NODE_ENV === 'production' && process.env.CONSUMPTION_METRICS !== '0');
type Scope = {
  queries: number;
  driverStatements: number;
  contextStatements: number;
  reads: number;
  writes: number;
  dbMs: number;
  poolWaitMs: number;
  dbValueBytesEstimate: number;
  nestedMs: number;
};
const scope = (): Scope => ({
  queries: 0,
  driverStatements: 0,
  contextStatements: 0,
  reads: 0,
  writes: 0,
  dbMs: 0,
  poolWaitMs: 0,
  dbValueBytesEstimate: 0,
  nestedMs: 0,
});
const context = new AsyncLocalStorage<Scope>();
const children = new WeakMap<Scope, { active: number; started: number }>();
// Fixed histogram: all observations count, including sustained peaks. Quantiles are upper bounds.
const bounds = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, Infinity];
const totals = new Map<
  string,
  Scope & {
    calls: number;
    errors: number;
    httpBytes: number;
    ms: number;
    exclusiveMs: number;
    histogram: number[];
  }
>();
export const queryLogger = {
  logQuery() {
    const s = context.getStore();
    if (s) s.queries++;
  },
};
export function record(key: string, s: Scope, ms: number, bytes = 0, error = false) {
  if (!enabled) return;
  if (!totals.has(key) && totals.size >= 128) key = 'other';
  const open = children.get(s);
  const nestedMs = s.nestedMs + (open?.active ? performance.now() - open.started : 0);
  const item = totals.get(key) || {
    ...scope(),
    calls: 0,
    errors: 0,
    httpBytes: 0,
    ms: 0,
    exclusiveMs: 0,
    histogram: bounds.map(() => 0),
  };
  item.calls++;
  item.errors += Number(error);
  item.httpBytes += bytes;
  for (const field of Object.keys(scope()) as (keyof Scope)[]) item[field] += s[field];
  item.ms += ms;
  item.exclusiveMs += Math.max(0, ms - nestedMs);
  item.histogram[bounds.findIndex((b) => ms <= b)]++;
  totals.set(key, item);
}
export const measureRequests: RequestHandler = (q, r, next) => {
  if (!enabled) return next();
  const s = scope(),
    start = performance.now();
  r.once('finish', () =>
    record(
      `${q.method} ${q.route?.path || '/api/unmatched'}`,
      s,
      performance.now() - start,
      Number(r.getHeader('content-length') || 0),
      r.statusCode >= 400,
    ),
  );
  context.run(s, next);
};
export async function measureJob<T>(name: string, job: () => Promise<T>): Promise<T> {
  if (!enabled) return job();
  const parent = context.getStore(),
    s = scope(),
    start = performance.now();
  if (parent) {
    const child = children.get(parent) || { active: 0, started: start };
    if (!child.active++) child.started = start;
    children.set(parent, child);
  }
  let failed = false;
  try {
    return await context.run(s, job);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const ms = performance.now() - start;
    if (parent) {
      const child = children.get(parent)!;
      if (!--child.active) parent.nestedMs += performance.now() - child.started;
    }
    record(`job:${name}`, s, ms, 0, failed);
  }
}
// Wrap the actual driver boundary, including RLS activation and transaction commands.
// Driver time is inclusive of network/server work; it is not server CPU time.
export function measuredClient<T extends object>(client: T): T {
  if (!enabled) return client;
  return new Proxy(client, {
    get(target: any, key) {
      if (
        key === 'query' &&
        typeof target.totalCount === 'number' &&
        typeof target.connect === 'function'
      )
        return (...args: any[]) => {
          const callback = typeof args.at(-1) === 'function' ? args.pop() : undefined;
          const execute = async () => {
            const s = context.getStore(),
              start = performance.now();
            let connection;
            try {
              connection = await target.connect();
            } finally {
              if (s) s.poolWaitMs += performance.now() - start;
            }
            try {
              return await (measuredClient(connection) as any).query(...args);
            } finally {
              connection.release();
            }
          };
          const result = execute();
          if (callback) {
            result.then(
              (value) => callback(null, value),
              (error) => callback(error),
            );
            return;
          }
          return result;
        };
      if (key === 'query')
        return (...args: any[]) => {
          const s = context.getStore(),
            start = performance.now();
          const text = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
          if (s) {
            s.driverStatements++;
            if (
              /^\s*(begin|commit|rollback|savepoint|release|set)\b/i.test(text) ||
              /select set_config\(/i.test(text)
            )
              s.contextStatements++;
            else if (/^\s*select\b/i.test(text)) s.reads++;
            else if (/^\s*(insert|update|delete)\b/i.test(text)) s.writes++;
          }
          const finish = (result?: any) => {
            if (!s) return;
            s.dbMs += performance.now() - start;
            // Estimate scalar payload once at the driver; excludes protocol/TLS framing.
            for (const row of result?.rows || [])
              for (const value of Object.values(row)) {
                if (typeof value === 'string') s.dbValueBytesEstimate += Buffer.byteLength(value);
                else if (Buffer.isBuffer(value)) s.dbValueBytesEstimate += value.length;
                else if (typeof value === 'number' || value instanceof Date)
                  s.dbValueBytesEstimate += 8;
                else if (typeof value === 'boolean') s.dbValueBytesEstimate++;
              }
          };
          const callback = args.at(-1);
          if (typeof callback === 'function') {
            args[args.length - 1] = (...values: any[]) => {
              finish(values[1]);
              callback(...values);
            };
            try {
              return target.query(...args);
            } catch (error) {
              finish();
              throw error;
            }
          }
          try {
            return Promise.resolve(target.query(...args)).then(
              (result) => {
                finish(result);
                return result;
              },
              (error) => {
                finish();
                throw error;
              },
            );
          } catch (error) {
            finish();
            throw error;
          }
        };
      if (key === 'connect')
        return async () => {
          const s = context.getStore(),
            start = performance.now();
          try {
            return measuredClient(await target.connect());
          } finally {
            if (s) s.poolWaitMs += performance.now() - start;
          }
        };
      if (key === 'transaction')
        return (fn: any) => target.transaction((tx: any) => fn(measuredClient(tx)));
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' && key !== 'constructor' ? value.bind(target) : value;
    },
  });
}
export function flushMetrics() {
  if (!enabled || !totals.size) return;
  const operations = [...totals].map(([operation, { histogram, ...values }]) => {
    const quantile = (fraction: number) => {
      let count = 0;
      const i = histogram.findIndex((n) => (count += n) >= Math.ceil(values.calls * fraction));
      return Number.isFinite(bounds[i]) ? bounds[i] : null;
    };
    return {
      operation,
      ...values,
      p50UpperMs: quantile(0.5),
      p95UpperMs: quantile(0.95),
      latencyObservationCount: values.calls,
      latencyOverflowCount: histogram.at(-1),
    };
  });
  console.log(JSON.stringify({ type: 'consumption', at: new Date().toISOString(), operations }));
  totals.clear();
}
const timer = enabled ? setInterval(flushMetrics, 60000) : undefined;
timer?.unref();
