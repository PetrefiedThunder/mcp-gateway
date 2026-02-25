export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private defaultPerMinute: number,
    private burstMultiplier: number = 2
  ) {}

  check(key: string, limitOverride?: number): { allowed: boolean; remaining: number; resetAt: number } {
    const limit = limitOverride || this.defaultPerMinute;
    const now = Date.now();
    const windowMs = 60_000;

    let window = this.windows.get(key);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }

    const maxBurst = Math.ceil(limit * this.burstMultiplier);
    if (window.count >= maxBurst) {
      return { allowed: false, remaining: 0, resetAt: window.resetAt };
    }

    window.count++;
    return {
      allowed: true,
      remaining: maxBurst - window.count,
      resetAt: window.resetAt,
    };
  }

  // Clean up expired windows periodically
  cleanup() {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(key);
    }
  }

  getUsage(key: string): { count: number; limit: number } | null {
    const window = this.windows.get(key);
    if (!window) return null;
    return { count: window.count, limit: this.defaultPerMinute };
  }
}
