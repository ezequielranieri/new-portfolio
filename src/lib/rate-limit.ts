/**
 * Rate limiting for the contact endpoint.
 *
 * A `Map` in module scope is useless behind a serverless pool: every instance
 * starts empty and nothing is shared, so an attacker gets N × limit attempts.
 * Upstash Redis gives one shared sliding window across instances.
 *
 * The hard requirement is that rate limiting NEVER breaks a legitimate send.
 * If Upstash is unreachable, misconfigured or over quota, we degrade to a
 * per-instance memory limiter instead of returning a 500 — the endpoint stays
 * up, the degradation is logged once, and the form keeps working.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/** Submissions allowed per client key per window. */
export const RATE_LIMIT_MAX = 5;
/** Window length: one hour. */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type RateLimitProvider = 'upstash' | 'memory';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Epoch ms at which the window frees up. */
  reset: number;
  provider: RateLimitProvider;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

type Clock = () => number;

/**
 * Sliding-window limiter kept in process memory.
 * Exported so the fallback path is unit-testable with an injected clock.
 */
export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: Clock;

  constructor(max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS, now: Clock = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => now - ts < this.windowMs);

    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { success: false, remaining: 0, reset: recent[0] + this.windowMs, provider: 'memory' };
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.evictExpired(now);
    return { success: true, remaining: this.max - recent.length, reset: now + this.windowMs, provider: 'memory' };
  }

  /** Keeps a long-lived instance from accumulating keys forever. */
  private evictExpired(now: number): void {
    if (this.hits.size <= 1000) return;
    for (const [key, timestamps] of this.hits) {
      if (timestamps.every((ts) => now - ts >= this.windowMs)) this.hits.delete(key);
    }
  }
}

function readEnv(name: string): string | undefined {
  // Vite inlines what was defined at build time; `process.env` covers values
  // injected into the function at runtime.
  const fromBuild = (import.meta.env as unknown as Record<string, string | undefined>)[name];
  if (fromBuild) return fromBuild;
  if (typeof process !== 'undefined') return process.env?.[name] || undefined;
  return undefined;
}

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(message); // i18n-ignore
}

export function createRateLimiter(): RateLimiter {
  const url = readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('UPSTASH_REDIS_REST_TOKEN');
  const memory = new MemoryRateLimiter();

  if (!url || !token) {
    warnOnce(
      'Contact rate limiting: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. ' +
        'Falling back to per-instance memory limiting; the limit is not shared across instances.' // i18n-ignore
    );
    return { limit: async (key) => memory.check(key) };
  }

  const ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX, '1 h'),
    prefix: 'contact-ratelimit',
    analytics: false,
  });

  return {
    async limit(key: string): Promise<RateLimitResult> {
      try {
        const { success, remaining, reset } = await ratelimit.limit(key);
        return { success, remaining, reset, provider: 'upstash' };
      } catch (error) {
        warnOnce(`Contact rate limiting: Upstash call failed, falling back to memory: ${String(error)}`); // i18n-ignore
        return memory.check(key);
      }
    },
  };
}
