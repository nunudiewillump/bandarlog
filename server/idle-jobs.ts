// A settled job has no timer unless it has a known deadline or failed.
export class IdleJobs<T> {
  private jobs = new Map<
    string,
    {
      input: T;
      timer?: ReturnType<typeof setTimeout>;
      at?: number;
      running?: Promise<void>;
      dirty: boolean;
      failures: number;
    }
  >();
  private stopped = false;
  constructor(
    private run: (input: T) => Promise<number | null>,
    private onError: (error: unknown) => void = () => {},
    private clock = {
      now: () => Date.now(),
      set: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    },
  ) {}
  schedule(key: string, input: T, at: number) {
    if (this.stopped) return;
    const job = this.jobs.get(key) || { input, dirty: false, failures: 0 };
    job.input = input;
    if (job.timer && job.at! <= at) return;
    if (job.running) {
      job.dirty = true;
      return;
    }
    if (job.timer) this.clock.clear(job.timer);
    job.at = at;
    job.timer = this.clock.set(
      () => {
        job.timer = undefined;
        void this.wake(key, job.input).catch(this.onError);
      },
      Math.min(2147483647, Math.max(0, at - this.clock.now())),
    );
    job.timer?.unref?.();
    this.jobs.set(key, job);
  }
  wake(key: string, input: T): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const job = this.jobs.get(key) || { input, dirty: false, failures: 0 };
    this.jobs.set(key, job);
    job.input = input;
    if (job.timer) {
      this.clock.clear(job.timer);
      job.timer = undefined;
    }
    if (job.running) {
      job.dirty = true;
      return job.running;
    }
    job.running = Promise.resolve().then(async () => {
      let next: number | null = null;
      try {
        do {
          job.dirty = false;
          next = await this.run(job.input);
          job.failures = 0;
        } while (job.dirty && !this.stopped);
      } catch (error) {
        job.failures++;
        next = this.clock.now() + Math.min(15 * 60000, 60000 * 2 ** Math.min(job.failures - 1, 4));
        throw error;
      } finally {
        job.running = undefined;
        if (this.stopped || next === null) this.jobs.delete(key);
        else this.schedule(key, job.input, next);
      }
    });
    return job.running;
  }
  stop() {
    this.stopped = true;
    for (const job of this.jobs.values()) if (job.timer) this.clock.clear(job.timer);
    this.jobs.clear();
  }
}

export function nextMadridMidnight(at = Date.now()) {
  // Search the next Madrid calendar boundary. DST days may have 23 or 25 hours.
  const day = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ms);
  const current = day(at);
  let low = at,
    high = at + 26 * 3600000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (day(mid) === current) low = mid;
    else high = mid;
  }
  return high;
}
