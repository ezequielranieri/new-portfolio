/**
 * Cloudflare Turnstile verification.
 *
 * The widget on the page produces a single-use token; only Siteverify decides
 * whether it is real. Verification is skipped entirely when no secret is
 * configured, so local development and previews do not require Cloudflare
 * credentials. Once a secret IS configured the check fails closed: a missing,
 * expired, reused or unverifiable token is rejected rather than let through.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  /** Whether the submission may proceed. */
  success: boolean;
  /** True when no secret is configured and verification was skipped. */
  skipped: boolean;
  /** Machine-readable cause when `success` is false. */
  reason?: 'missing-token' | 'rejected' | 'verify-error';
  /** Cloudflare error codes, when it returned any. */
  errorCodes?: string[];
}

export interface VerifyTurnstileOptions {
  token?: string;
  secret?: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}

export async function verifyTurnstileToken({
  token,
  secret,
  remoteIp,
  fetchImpl = fetch,
}: VerifyTurnstileOptions): Promise<TurnstileResult> {
  if (!secret) return { success: true, skipped: true };

  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return { success: false, skipped: false, reason: 'missing-token' };

  const body = new URLSearchParams({ secret, response: value });
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      return { success: false, skipped: false, reason: 'verify-error' };
    }

    const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (result.success === true) return { success: true, skipped: false };

    return {
      success: false,
      skipped: false,
      reason: 'rejected',
      errorCodes: result['error-codes'] ?? [],
    };
  } catch {
    return { success: false, skipped: false, reason: 'verify-error' };
  }
}
