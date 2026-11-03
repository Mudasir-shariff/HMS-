/* ──────────────────────────────────────────────────────────────
   In-memory sliding window rate limiter
   Protects auth endpoints and sensitive actions
   ────────────────────────────────────────────────────────────── */

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60 * 1000, maxRequests: 10 }
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const record = store.get(identifier) || { timestamps: [] };

  // Remove timestamps older than the window
  record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);

  if (record.timestamps.length >= options.maxRequests) {
    const oldest = record.timestamps[0];
    const resetMs = options.windowMs - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  store.set(identifier, record);

  return {
    allowed: true,
    remaining: options.maxRequests - record.timestamps.length,
    resetMs: options.windowMs,
  };
}

