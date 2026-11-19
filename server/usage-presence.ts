/** Cache only hashed sessions, bounded per process. No per-request SQL after the first Madrid-day observation. */
export function dailyPresenceBudget(clock: () => number = Date.now, maximum = 4096) {
  const seen = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const key = (group: string, sessionHash: string) =>
    group + '\n' + sessionHash + '\n' + formatter.format(clock());
  const put = (k: string, until: number) => {
    if (!seen.has(k) && seen.size >= maximum) seen.delete(seen.keys().next().value!);
    seen.set(k, until);
  };
  return {
    claim: (group: string, sessionHash: string) => {
      const k = key(group, sessionHash);
      if ((seen.get(k) || 0) > clock()) return false;
      put(k, clock() + 24 * 3600000);
      return true;
    },
    retry: (group: string, sessionHash: string) => put(key(group, sessionHash), clock() + 60000),
  };
}

/** Aggregate proof failures only; no IP, identity or URL, and no idle polling. */
export function authenticationDenials(
  write: (method: 'email' | 'google', count: number) => Promise<unknown>,
) {
  const counts = { email: 0, google: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const snapshot = { ...counts };
    counts.email = 0;
    counts.google = 0;
    pending = pending
      .then(async () => {
        for (const method of ['email', 'google'] as const)
          if (snapshot[method]) await write(method, snapshot[method]);
      })
      .catch(() => console.error({ event: 'usage.denial.failed' }));
    return pending;
  };
  return {
    record: (method: 'email' | 'google') => {
      counts[method] = Math.min(1000000, counts[method] + 1);
      if (!timer) {
        timer = setTimeout(() => void flush(), 1000);
        timer.unref();
      }
    },
    flush,
  };
}
