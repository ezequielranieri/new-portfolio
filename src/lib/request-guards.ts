/**
 * Cross-origin guard for the unauthenticated contact endpoint.
 *
 * There is no session to protect here, so a CSRF token would add ceremony
 * without adding protection. What is worth rejecting is a page that is not
 * ours submitting the endpoint on a visitor's behalf.
 *
 * - `Origin` present and not on the allowlist -> cross-origin. A browser can
 *   never forge `Origin`, so comparing it against the places this site
 *   actually runs at is sufficient.
 * - The allowlist is: the origin the request was actually sent to (same-origin
 *   by definition and needed for custom domains and preview deployments),
 *   `siteUrl` (the canonical production site), the current `VERCEL_URL`
 *   preview deployment when set, and localhost dev servers outside
 *   production. Matching origins requires scheme, host and port.
 * - `Origin` absent -> NOT cross-origin. curl, server-to-server calls and some
 *   privacy modes omit it; absence is not evidence of an attack, and treating
 *   it as one would break non-browser clients for no security gain.
 * - `Sec-Fetch-Site: cross-site` -> cross-origin even when `Origin` was
 *   stripped. `same-origin`, `same-site` and `none` pass.
 */
export function isCrossOriginRequest(request: Request, siteUrl: string): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site.trim().toLowerCase() === 'cross-site') return true;

  const origin = request.headers.get('origin');
  if (origin === null) return false;

  return !collectAllowedOrigins(request, siteUrl).has(normalizeOrigin(origin));
}

function collectAllowedOrigins(request: Request, siteUrl: string): Set<string> {
  const allowed = new Set<string>();

  // The origin the request was sent to: same-origin by definition. This keeps
  // custom domains and preview deployments working where `siteUrl` alone
  // would be too narrow.
  try {
    allowed.add(new URL(request.url).origin.toLowerCase());
  } catch {
    // An unparseable request URL contributes nothing to the allowlist.
  }

  if (siteUrl) {
    allowed.add(normalizeOrigin(siteUrl));
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    // VERCEL_URL is host-only; normalization fills in the default scheme.
    allowed.add(normalizeOrigin(/^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl.trim()}`));
  }

  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:4321');
    allowed.add('http://127.0.0.1:4321');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }

  return allowed;
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\/+$/, '');
  try {
    return new URL(trimmed).origin;
  } catch {
    // Unparseable values (`null`, garbage) simply never match the site.
    return trimmed;
  }
}
