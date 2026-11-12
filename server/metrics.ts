import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';

// Opt-in, bounded aggregates only: no SQL, parameters, paths, IDs or user data.
const enabled =
  process.env.CONSUMPTION_METRICS === '1' ||
  (process.env.NODE_ENV === 'production' && process.env.CONSUMPTION_METRICS !== '0');
const context = new AsyncLocalStorage<{ queries: number }>();
const totals = new Map<
  string,
  {
    calls: number;
    errors: number;
    queries: number;
    httpBytes: number;
    ms: number;
    samples: number[];
  }
>();
export const queryLogger = {
  logQuery() {
    const scope = context.getStore();
    if (scope) scope.queries++;
  },
};
export function record(
  key: string,
  scope: { queries: number },
  ms: number,
  bytes = 0,
  error = false,
) {
  if (!enabled) return;
  const item = totals.get(key) || {
    calls: 0,
    errors: 0,
    queries: 0,
    httpBytes: 0,
    ms: 0,
    samples: [],
  };
  item.calls++;
  item.errors += Number(error);
  item.queries += scope.queries;
  item.httpBytes += bytes;
  item.ms += ms;
  if (item.samples.length < 256) item.samples.push(ms);
  totals.set(key, item);
}
export const measureRequests: RequestHandler = (q, r, next) => {
  if (!enabled) return next();
  const scope = { queries: 0 },
    start = performance.now();
  r.once('finish', () =>
    record(
      `${q.method} ${q.route?.path || '/api/unmatched'}`,
      scope,
      performance.now() - start,
      Number(r.getHeader('content-length') || 0),
      r.statusCode >= 400,
    ),
  );
  context.run(scope, next);
};
export async function measureJob<T>(name: string, job: () => Promise<T>): Promise<T> {
  if (!enabled) return job();
  const scope = { queries: 0 },
    start = performance.now();
  let failed = false;
  try {
    return await context.run(scope, job);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    record(`job:${name}`, scope, performance.now() - start, 0, failed);
  }
}
export function flushMetrics() {
  if (!enabled || !totals.size) return;
  const operations = [...totals].map(([operation, { samples, ...values }]) => {
    samples.sort((a, b) => a - b);
    return {
      operation,
      ...values,
      p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
      latencySampleCount: samples.length,
    };
  });
  console.log(JSON.stringify({ type: 'consumption', at: new Date().toISOString(), operations }));
  totals.clear();
}
const timer = enabled ? setInterval(flushMetrics, 60000) : undefined;
timer?.unref();
