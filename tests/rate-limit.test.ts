import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../src/lib/security/rate-limit';

describe('Sliding Window Rate Limiter', () => {
  it('allows requests within limit', () => {
    const ip = '192.168.1.10';
    const res1 = checkRateLimit(ip, { windowMs: 1000, maxRequests: 3 });
    const res2 = checkRateLimit(ip, { windowMs: 1000, maxRequests: 3 });
    const res3 = checkRateLimit(ip, { windowMs: 1000, maxRequests: 3 });

    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks requests exceeding limit', () => {
    const ip = '192.168.1.20';
    checkRateLimit(ip, { windowMs: 1000, maxRequests: 2 });
    checkRateLimit(ip, { windowMs: 1000, maxRequests: 2 });
    const resBlocked = checkRateLimit(ip, { windowMs: 1000, maxRequests: 2 });

    expect(resBlocked.allowed).toBe(false);
    expect(resBlocked.remaining).toBe(0);
    expect(resBlocked.resetMs).toBeGreaterThan(0);
  });
});

