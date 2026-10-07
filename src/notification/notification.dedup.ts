export interface DedupOptions {
  windowSeconds: number;
  now?: () => number;
}

/**
 * In-memory deduplication cache.
 * Same source+title+message within the window is treated as a duplicate.
 */
export class NotificationDeduper {
  private readonly cache = new Map<string, number>();
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: DedupOptions) {
    this.windowMs = options.windowSeconds * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  static makeKey(source: string, title: string, message: string): string {
    return `${source}\u0000${title}\u0000${message}`.toLowerCase();
  }

  /** Returns true if this notification should be sent (not a duplicate). */
  shouldSend(source: string, title: string, message: string): boolean {
    this.prune();
    const key = NotificationDeduper.makeKey(source, title, message);
    const ts = this.now();
    const prev = this.cache.get(key);
    if (prev !== undefined && ts - prev < this.windowMs) {
      return false;
    }
    this.cache.set(key, ts);
    return true;
  }

  /** Exposed for tests. */
  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, ts] of this.cache) {
      if (ts < cutoff) {
        this.cache.delete(key);
      }
    }
  }
}
