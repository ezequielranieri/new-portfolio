import { describe, it, expect, vi } from 'vitest';
import { verifyTurnstileToken } from '../src/lib/turnstile';

const SECRET = 'test-secret';

function fakeFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init ?? {}));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('verifyTurnstileToken — skipping', () => {
  it('skips when no secret is configured', async () => {
    const fetchImpl = fakeFetch(() => json({ success: false }));
    const result = await verifyTurnstileToken({ token: 'whatever', secret: undefined, fetchImpl: fetchImpl as typeof fetch });

    expect(result).toEqual({ success: true, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not require a token when there is no secret (local development)', async () => {
    const result = await verifyTurnstileToken({ token: undefined, secret: '', fetchImpl: fakeFetch(() => json({})) as typeof fetch });
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
  });
});

describe('verifyTurnstileToken — missing token', () => {
  it('rejects when the secret is configured and the token is absent', async () => {
    const fetchImpl = fakeFetch(() => json({ success: true }));
    const result = await verifyTurnstileToken({ secret: SECRET, fetchImpl: fetchImpl as typeof fetch });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('missing-token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only token without calling Cloudflare', async () => {
    const fetchImpl = fakeFetch(() => json({ success: true }));
    const result = await verifyTurnstileToken({ token: '   ', secret: SECRET, fetchImpl: fetchImpl as typeof fetch });

    expect(result.reason).toBe('missing-token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('verifyTurnstileToken — Siteverify call', () => {
  it('posts the secret, the token and the client IP as form data', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = fakeFetch((url, init) => {
      captured = { url, init };
      return json({ success: true });
    });

    await verifyTurnstileToken({
      token: 'token-abc',
      secret: SECRET,
      remoteIp: '203.0.113.9',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(captured!.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(captured!.init.method).toBe('POST');
    expect(captured!.init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });

    const body = new URLSearchParams(String(captured!.init.body));
    expect(body.get('secret')).toBe(SECRET);
    expect(body.get('response')).toBe('token-abc');
    expect(body.get('remoteip')).toBe('203.0.113.9');
  });

  it('omits remoteip when the IP is unknown', async () => {
    let body = '';
    const fetchImpl = fakeFetch((_url, init) => {
      body = String(init.body);
      return json({ success: true });
    });

    await verifyTurnstileToken({ token: 't', secret: SECRET, remoteIp: 'unknown', fetchImpl: fetchImpl as typeof fetch });

    expect(new URLSearchParams(body).has('remoteip')).toBe(false);
  });

  it('accepts a token Cloudflare marks as valid', async () => {
    const result = await verifyTurnstileToken({
      token: 'good',
      secret: SECRET,
      fetchImpl: fakeFetch(() => json({ success: true, 'error-codes': [] })) as typeof fetch,
    });
    expect(result).toEqual({ success: true, skipped: false });
  });

  it('rejects a token Cloudflare marks as invalid and keeps the error codes', async () => {
    const result = await verifyTurnstileToken({
      token: 'bad',
      secret: SECRET,
      fetchImpl: fakeFetch(() => json({ success: false, 'error-codes': ['invalid-input-response'] })) as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('rejected');
    expect(result.errorCodes).toEqual(['invalid-input-response']);
  });

  it('treats a non-2xx Siteverify response as a verification error', async () => {
    const result = await verifyTurnstileToken({
      token: 't',
      secret: SECRET,
      fetchImpl: fakeFetch(() => new Response('upstream down', { status: 500 })) as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('verify-error');
  });

  it('fails closed when the network call throws', async () => {
    const result = await verifyTurnstileToken({
      token: 't',
      secret: SECRET,
      fetchImpl: fakeFetch(() => {
        throw new Error('ECONNRESET');
      }) as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('verify-error');
  });

  it('fails closed when the response is not valid JSON', async () => {
    const result = await verifyTurnstileToken({
      token: 't',
      secret: SECRET,
      fetchImpl: fakeFetch(() => new Response('<html>oops</html>', { status: 200 })) as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('verify-error');
  });

  it('fails closed when Cloudflare omits the success flag', async () => {
    const result = await verifyTurnstileToken({
      token: 't',
      secret: SECRET,
      fetchImpl: fakeFetch(() => json({ 'error-codes': [] })) as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('rejected');
  });
});
