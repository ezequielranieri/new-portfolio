/**
 * URL normalization helpers — single source of truth for all internal links.
 *
 * Rules (trailingSlash: 'always'):
 * - Paths end with "/"  (e.g. "/blog/", "/blog/slug/")
 * - Hash links: "/#section" (no trailing slash before #)
 * - Query strings: "/blog/?foo=bar" (no trailing slash before ?)
 * - No double slashes
 * - Optional base URL for absolute URLs (canonical, OG, sitemap)
 */

import { SITE_URL } from '@/config/site';
export type Locale = 'en' | 'es';
const DEFAULT_LOCALE: Locale = 'en';

/**
 * Normalize a path segment: ensure leading slash, collapse double slashes.
 * Does NOT add trailing slash — that's done by the public helpers.
 */
function normalizePath(path: string): string {
  // Remove any protocol/domain if accidentally passed
  const withoutDomain = path.replace(/^https?:\/\/[^/]+/, '');
  // Ensure leading slash
  const withLeading = withoutDomain.startsWith('/') ? withoutDomain : `/${withoutDomain}`;
  // Collapse double slashes (but preserve leading // for protocol-relative, which we don't use)
  return withLeading.replace(/\/+/g, '/');
}

/**
 * Build an internal path with proper trailing slash (for directory-style routes).
 * Strips any existing trailing slash before adding exactly one.
 * Does NOT apply to hash-only or query-only paths.
 */
export function url(path: string, hash?: string, locale?: Locale): string {
  const normalized = normalizePath(path);

  // Handle hash: split path and hash
  const [pathPart, existingHash] = normalized.split('#');
  const finalHash = hash ?? existingHash ?? '';

  // Normalize the path part: remove trailing slash, then add exactly one
  // UNLESS it's a hash-only link (empty pathPart after normalization)
  const pathOnly = pathPart || '/';
  let withTrailing = pathOnly.endsWith('/') ? pathOnly : `${pathOnly}/`;

  if (locale && locale !== DEFAULT_LOCALE) {
    if (withTrailing === '/') withTrailing = '/es/';
    else if (withTrailing.startsWith('/')) withTrailing = `/es${withTrailing}`;
  }

  return finalHash ? `${withTrailing}#${finalHash}` : withTrailing;
}

/**
 * Build a hash-only link (e.g., "/#projects") — always root path + hash.
 */
export function hashLink(hash: string, locale?: Locale): string {
  const base = locale && locale !== DEFAULT_LOCALE ? '/es/' : '/';
  const h = hash.replace(/^#/, '');
  return `${base}#${h}`;
}

/**
 * Build an absolute URL for canonical, Open Graph, sitemap, JSON-LD, etc.
 * Always ends with "/" for directory routes.
 */
export function absoluteUrl(path: string, locale?: Locale): string {
  const normalizedPath = url(path, undefined, locale); // already has trailing slash
  return `${SITE_URL}${normalizedPath}`;
}

/**
 * Build an absolute URL for a hash link (e.g., for JSON-LD mainEntityOfPage with fragment).
 * Hash URLs don't get a trailing slash before the #.
 */
export function absoluteHashUrl(hash: string, locale?: Locale): string {
  return `${SITE_URL}${hashLink(hash, locale)}`;
}

/**
 * Check if a URL is external (has protocol and different domain).
 */
export function isExternal(url: string): boolean {
  try {
    const u = new URL(url);
    const site = new URL(SITE_URL);
    return u.hostname !== site.hostname;
  } catch {
    return false;
  }
}