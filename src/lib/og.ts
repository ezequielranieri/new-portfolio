/**
 * Open Graph image URLs.
 *
 * Every page must publish one: a card pointing at a file that does not exist
 * renders as a blank preview in every social client. The default cover is a
 * real 1200x630 PNG in `public/og/`, and `scripts/generate-og.mjs` produces one
 * card per published article and locale.
 */
import { SITE_URL } from '@/config/site';
import type { Locale } from '@/i18n';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Site-wide fallback cover. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og/default.png`;

/**
 * Card for one article. `locale` is the language of the copy actually shown,
 * so an English body rendered on a Spanish route still gets the English card.
 */
export function articleOgImage(locale: Locale, slug: string): string {
  return `${SITE_URL}/og/blog/${locale}/${slug}.png`;
}
