/**
 * A sliding-window counter kept in memory: at most `limit` hits per key in any `windowMs`.
 * It lives in one server process, so on Vercel each instance counts on its own; a soft
 * limit that keeps the contact form from being a free relay, not a hard guarantee. Move
 * the counts to a shared store (Upstash, KV) if abuse ever shows up.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Records a hit when allowed and returns true; returns false when the key is over the limit. */
  take(key: string, now: number = Date.now()): boolean {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.prune(since);
    return true;
  }

  /** How many hits the key has left in the current window. */
  remaining(key: string, now: number = Date.now()): number {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    return Math.max(0, this.limit - recent.length);
  }

  /** Forgets keys whose hits have all expired, so the map does not grow forever. */
  private prune(since: number): void {
    if (this.hits.size < 1000) return;
    for (const [key, times] of this.hits) {
      if (times.every((at) => at <= since)) this.hits.delete(key);
    }
  }
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
