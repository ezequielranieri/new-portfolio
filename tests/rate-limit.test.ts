import { describe, it, expect, vi } from 'vitest';
import { MemoryRateLimiter, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, createRateLimiter } from '../src/lib/rate-limit';

const WINDOW = 60 * 60 * 1000;

function clocked(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('MemoryRateLimiter', () => {
  it('allows exactly the configured maximum', () => {
    const limiter = new MemoryRateLimiter(5, WINDOW, () => 0);
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.check('1.2.3.4').success).toBe(true);
    }
  });

  it('blocks the request after the maximum', () => {
    const limiter = new MemoryRateLimiter(5, WINDOW, () => 0);
    for (let i = 0; i < 5; i += 1) limiter.check('1.2.3.4');

    const result = limiter.check('1.2.3.4');
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.provider).toBe('memory');
  });

  it('reports the remaining budget as it is consumed', () => {
    const limiter = new MemoryRateLimiter(3, WINDOW, () => 0);
    expect(limiter.check('k').remaining).toBe(2);
    expect(limiter.check('k').remaining).toBe(1);
    expect(limiter.check('k').remaining).toBe(0);
  });

  it('does not count a blocked attempt against the window', () => {
    const c = clocked();
    const limiter = new MemoryRateLimiter(1, WINDOW, c.now);
    limiter.check('k');
    c.advance(1000);
    expect(limiter.check('k').success).toBe(false);
    // The rejected attempt must not extend the lockout.
    expect(limiter.check('k').reset).toBe(WINDOW);
  });

  it('frees the slot after the window elapses', () => {
    const c = clocked();
    const limiter = new MemoryRateLimiter(2, WINDOW, c.now);
    limiter.check('k');
    limiter.check('k');
    expect(limiter.check('k').success).toBe(false);

    c.advance(WINDOW + 1);
    expect(limiter.check('k').success).toBe(true);
  });

  it('keeps the window sliding, not fixed', () => {
    const c = clocked();
    const limiter = new MemoryRateLimiter(2, WINDOW, c.now);
    limiter.check('k');           // t=0
    c.advance(30 * 60 * 1000);
    limiter.check('k');           // t=30min
    expect(limiter.check('k').success).toBe(false);

    c.advance(30 * 60 * 1000 + 1); // t=60min+1 -> the first hit expired
    expect(limiter.check('k').success).toBe(true);
  });

  it('isolates clients from each other', () => {
    const limiter = new MemoryRateLimiter(1, WINDOW, () => 0);
    expect(limiter.check('a').success).toBe(true);
    expect(limiter.check('a').success).toBe(false);
    expect(limiter.check('b').success).toBe(true);
  });

  it('defaults to 5 per hour', () => {
    expect(RATE_LIMIT_MAX).toBe(5);
    expect(RATE_LIMIT_WINDOW_MS).toBe(WINDOW);
  });

  it('evicts fully expired keys instead of growing forever', () => {
    const c = clocked();
    const limiter = new MemoryRateLimiter(1, WINDOW, c.now);
    for (let i = 0; i < 1100; i += 1) limiter.check(`ip-${i}`);

    c.advance(WINDOW + 1);
    limiter.check('fresh');

    // Still functional for a returning client whose old entry was evicted.
    expect(limiter.check('ip-0').success).toBe(true);
  });
});

describe('createRateLimiter — fallback', () => {
  it('degrades to memory when Upstash is not configured', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = createRateLimiter();

    const first = await limiter.limit('1.2.3.4');
    expect(first.provider).toBe('memory');
    expect(first.success).toBe(true);

    for (let i = 0; i < RATE_LIMIT_MAX - 1; i += 1) await limiter.limit('1.2.3.4');
    expect((await limiter.limit('1.2.3.4')).success).toBe(false);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it('degrades to memory when only one of the two variables is set', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = createRateLimiter();

    expect((await limiter.limit('1.2.3.4')).provider).toBe('memory');

    warn.mockRestore();
    vi.unstubAllEnvs();
  });
});
