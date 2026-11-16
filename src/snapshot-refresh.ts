// Revisions are process-local hints, never authorization or durable data versions.
export function covers(snapshot?: string, event?: string) {
  if (!snapshot || !event) return false;
  const a = snapshot.split(':'),
    b = event.split(':');
  return (
    a.length === 2 &&
    b.length === 2 &&
    a[0] === b[0] &&
    /^\d+$/.test(a[1]) &&
    /^\d+$/.test(b[1]) &&
    Number(a[1]) >= Number(b[1])
  );
}
export class SnapshotRefresh<T> {
  private generation = 0;
  private wanted?: string;
  private running?: Promise<T>;
  private latest?: T;
  constructor(
    private fetch: () => Promise<T>,
    private revision: (data: T) => string | undefined,
  ) {}
  read(revision?: string): Promise<T> {
    if (revision && this.latest !== undefined && covers(this.revision(this.latest), revision))
      return this.running || Promise.resolve(this.latest);
    this.generation++;
    this.wanted = revision;
    if (this.running) return this.running;
    this.running = Promise.resolve()
      .then(async () => {
        for (;;) {
          const started = this.generation;
          const value = await this.fetch();
          this.latest = value;
          // A read started after a signal covers it by causality, even across restarts.
          // Signals received during the read need either proof of coverage or one more read.
          if (started === this.generation || covers(this.revision(value), this.wanted))
            return value;
        }
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
