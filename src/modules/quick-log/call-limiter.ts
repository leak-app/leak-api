/** Fixed-window call counter per key, held in memory (one API instance). */
export class CallLimiter {
  private readonly windows = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Number of keys with a live window. */
  get size(): number {
    return this.windows.size;
  }

  /** True and counted, or false when `key` is over the limit in the current window. */
  tryAcquire(key: string, now: number = Date.now()): boolean {
    this.dropExpired(now);

    const current = this.windows.get(key);
    if (!current) {
      this.windows.set(key, { start: now, count: 1 });
      return this.limit > 0;
    }
    if (current.count >= this.limit) return false;

    current.count += 1;
    return true;
  }

  private dropExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
