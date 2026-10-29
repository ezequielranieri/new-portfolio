import { describe, it, expect } from 'vitest';
import { isCrossOriginRequest } from '../src/lib/request-guards';

const SITE = 'https://ezequielranieri.vercel.app';

const req = (headers: Record<string, string> = {}) =>
  new Request('https://ezequielranieri.vercel.app/api/contact/', { method: 'POST', headers });

const reqOn = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', headers });

/** Temporarily pin NODE_ENV and restore it afterwards. */
function withNodeEnv(value: string, fn: () => void): void {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    fn();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

describe('isCrossOriginRequest — Origin header', () => {
  it('accepts a request with the exact site origin', () => {
    expect(isCrossOriginRequest(req({ origin: SITE }), SITE)).toBe(false);
  });

  it('accepts the site origin with a trailing slash', () => {
    expect(isCrossOriginRequest(req({ origin: `${SITE}/` }), SITE)).toBe(false);
  });

  it('accepts the site origin regardless of case', () => {
    expect(isCrossOriginRequest(req({ origin: 'HTTPS://EZEQUIELRANIERI.VERCEL.APP' }), SITE)).toBe(false);
  });

  it('rejects a different host', () => {
    expect(isCrossOriginRequest(req({ origin: 'https://evil.example.com' }), SITE)).toBe(true);
  });

  it('rejects a subdomain of the site', () => {
    expect(isCrossOriginRequest(req({ origin: 'https://aegis.ezequielranieri.vercel.app' }), SITE)).toBe(true);
  });

  it('rejects the same host over http', () => {
    expect(isCrossOriginRequest(req({ origin: 'http://ezequielranieri.vercel.app' }), SITE)).toBe(true);
  });

  it('rejects an explicit same-host different port', () => {
    expect(isCrossOriginRequest(req({ origin: 'https://ezequielranieri.vercel.app:8443' }), SITE)).toBe(true);
  });

  it('rejects "null" origin from a sandboxed document', () => {
    expect(isCrossOriginRequest(req({ origin: 'null' }), SITE)).toBe(true);
  });

  it('accepts a request with no Origin at all (curl, server-to-server)', () => {
    expect(isCrossOriginRequest(req(), SITE)).toBe(false);
  });
});

describe('isCrossOriginRequest — request-host allowlist', () => {
  it('accepts an Origin equal to the request host on a custom domain', () => {
    expect(isCrossOriginRequest(reqOn('https://custom-domain.example/api/contact/', { origin: 'https://custom-domain.example' }), SITE)).toBe(false);
  });

  it('accepts a Vercel preview deployment listed in VERCEL_URL', () => {
    const previous = process.env.VERCEL_URL;
    process.env.VERCEL_URL = 'portfolio-git-main-team.vercel.app';
    try {
      expect(isCrossOriginRequest(req({ origin: 'https://portfolio-git-main-team.vercel.app' }), SITE)).toBe(false);
    } finally {
      process.env.VERCEL_URL = previous;
    }
  });

  it('accepts the running localhost dev server outside production', () => {
    withNodeEnv('development', () => {
      expect(isCrossOriginRequest(reqOn('http://localhost:4321/api/contact/', { origin: 'http://localhost:4321' }), SITE)).toBe(false);
      expect(isCrossOriginRequest(reqOn('http://127.0.0.1:4321/api/contact/', { origin: 'http://127.0.0.1:4321' }), SITE)).toBe(false);
    });
  });

  it('rejects a localhost Origin served from the public site in production', () => {
    withNodeEnv('production', () => {
      expect(isCrossOriginRequest(req({ origin: 'http://localhost:4321' }), SITE)).toBe(true);
    });
  });
});

describe('isCrossOriginRequest — Sec-Fetch-Site header', () => {
  it('rejects cross-site', () => {
    expect(isCrossOriginRequest(req({ 'sec-fetch-site': 'cross-site' }), SITE)).toBe(true);
  });

  it('rejects cross-site even when Origin matches the site', () => {
    expect(isCrossOriginRequest(req({ 'sec-fetch-site': 'cross-site', origin: SITE }), SITE)).toBe(true);
  });

  it('rejects cross-site even when Origin was stripped', () => {
    expect(isCrossOriginRequest(req({ 'sec-fetch-site': 'Cross-Site' }), SITE)).toBe(true);
  });

  it('accepts same-origin', () => {
    expect(isCrossOriginRequest(req({ 'sec-fetch-site': 'same-origin', origin: SITE }), SITE)).toBe(false);
  });

  it('accepts same-site', () => {
    expect(isCrossOriginRequest(req({ 'sec-fetch-site': 'same-site', origin: SITE }), SITE)).toBe(false);
  });

  it('accepts none (direct navigation / user-initiated)', () => {
    expect(isCrossOriginRequest(req({ 'sec-fetch-site': 'none' }), SITE)).toBe(false);
  });

  it('still applies the Origin check when Sec-Fetch-Site is absent', () => {
    expect(isCrossOriginRequest(req({ origin: 'https://evil.example.com' }), SITE)).toBe(true);
  });
});
