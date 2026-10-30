import { getCollection } from 'astro:content';
import { SITE_URL, BLOG, PROJECT_REPOS } from '@/config/site';
import type { Locale } from '@/i18n';

/**
 * Represents a blog post with computed metadata.
 *
 * Content lives at `src/content/blog/<locale>/<file>.md`; the collection id is
 * `<locale>/<file>`. The public `slug` is the bare file name so English URLs
 * stay exactly as they were before i18n was introduced.
 */
export interface BlogPost {
  slug: string;
  translationKey: string;
  title: string;
  excerpt: string;
  date: Date;
  updatedDate?: Date;
  tags: string[];
  draft: boolean;
  lang: Locale;
  readingTimeMinutes: number;
  body: string;
  /** Locale-aware public path, e.g. "/blog/slug/" or "/es/blog/slug/". */
  url: string;
  repo: string | null;
}

const DEFAULT_LOCALE: Locale = 'en';

/** Split a collection id ("en/slug" | "es/slug") into locale + slug. */
function splitId(id: string): { locale: Locale; slug: string } {
  const idx = id.indexOf('/');
  if (idx === -1) return { locale: DEFAULT_LOCALE, slug: id };
  const maybeLocale = id.slice(0, idx);
  const rest = id.slice(idx + 1);
  const locale: Locale = maybeLocale === 'es' ? 'es' : 'en';
  return { locale, slug: rest };
}

/** Build the locale-aware public path for a post. */
export function blogPostPath(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE ? `/blog/${slug}/` : `/es/blog/${slug}/`;
}

/** Build the locale-aware public path for the blog index. */
export function blogIndexPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/blog/' : '/es/blog/';
}

/**
 * Get blog posts for one locale, sorted by date (newest first).
 * In production, drafts are filtered out.
 */
export async function getBlogPosts(locale: Locale = DEFAULT_LOCALE): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  const isProduction = import.meta.env.PROD;

  return posts
    .filter((post) => splitId(post.id).locale === locale)
    .filter((post) => !isProduction || !post.data.draft)
    .map((post) => {
      const { slug } = splitId(post.id);
      const repoKey = slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()) as keyof typeof PROJECT_REPOS;
const repo = PROJECT_REPOS[repoKey] || null;
      const body = post.body || '';
      const wordCount = body.trim().split(/\s+/).length;
      const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / BLOG.readingTimeWordsPerMinute));
      return {
        slug,
        translationKey: post.data.translationKey || slug,
        title: post.data.title,
        excerpt: post.data.excerpt,
        date: new Date(post.data.date),
        updatedDate: post.data.updatedDate ? new Date(post.data.updatedDate) : undefined,
        tags: post.data.tags || [],
        draft: post.data.draft,
        repo,
        lang: locale,
        readingTimeMinutes,
        body,
        url: blogPostPath(locale, slug),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Get a single blog post by slug within a locale.
 */
export async function getBlogPost(locale: Locale, slug: string): Promise<BlogPost | null> {
  const posts = await getBlogPosts(locale);
  return posts.find((p) => p.slug === slug) || null;
}

/**
 * Get the previous and next post relative to a given slug, within a locale.
 */
export async function getAdjacentPosts(
  locale: Locale,
  slug: string,
): Promise<{ prev: BlogPost | null; next: BlogPost | null }> {
  const posts = await getBlogPosts(locale);
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: posts[index + 1] || null,
    next: posts[index - 1] || null,
  };
}

/**
 * Map a translationKey to the slug available in each locale.
 * Used by the language switcher to reach the translated equivalent of an
 * article, falling back to the blog index when no translation exists.
 *
 * Drafts are treated as absent in every environment — not only in production —
 * so the map never names a slug that has no generated route (draft Spanish
 * articles get no `/es/blog/<slug>/` page).
 */
export async function getTranslationMap(): Promise<Record<string, Partial<Record<Locale, string>>>> {
  const posts = await getCollection('blog');
  const map: Record<string, Partial<Record<Locale, string>>> = {};

  for (const post of posts) {
    if (post.data.draft) continue;
    const { locale, slug } = splitId(post.id);
    const key = post.data.translationKey || slug;
    map[key] = map[key] || {};
    map[key][locale] = slug;
  }
  return map;
}

const DISPLAY_LOCALES: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
};

/**
 * Format a date for display using the locale (e.g., "15 JAN 2026" / "15 ENE 2026").
 * Uppercasing is left to CSS wherever possible; the string is returned as-is.
 */
export function formatDisplayDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], {
    month: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '')
    .toUpperCase();
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/**
 * Format a date for the datetime attribute (ISO 8601).
 */
export function formatDateTime(date: Date): string {
  return date.toISOString();
}

/**
 * Effective modification date for structured data.
 * A manual `updatedDate` only counts when it post-dates publication; otherwise
 * `dateModified` would be earlier than `datePublished`.
 */
export function getModifiedDate(post: BlogPost): Date {
  return post.updatedDate && post.updatedDate.getTime() > post.date.getTime()
    ? post.updatedDate
    : post.date;
}

/**
 * Canonical URL for a blog post, per locale.
 */
export function getCanonicalUrl(locale: Locale, slug: string): string {
  return `${SITE_URL}${blogPostPath(locale, slug)}`;
}

/**
 * Canonical URL for the blog index, per locale.
 */
export function getBlogIndexCanonicalUrl(locale: Locale = DEFAULT_LOCALE): string {
  return `${SITE_URL}${blogIndexPath(locale)}`;
}

/**
 * One row of the blog index: the post to render plus which locale its content
 * actually lives in. `fallback` is true when the requested locale has no
 * translation and the English post is shown instead.
 */
export interface BlogListingItem {
  slug: string;
  post: BlogPost;
  contentLocale: Locale;
  fallback: boolean;
}

/** Index a list of posts by translationKey (first one wins). */
function indexByTranslationKey(posts: BlogPost[]): Map<string, BlogPost> {
  const map = new Map<string, BlogPost>();
  for (const post of posts) {
    if (!map.has(post.translationKey)) map.set(post.translationKey, post);
  }
  return map;
}

/**
 * Build the blog listing for a locale: native posts where they exist, English
 * fallbacks otherwise, sorted newest first.
 *
 * For `locale === 'en'` this returns exactly the same set and order as
 * `getBlogPosts('en')`, so the English blog index is unchanged.
 */
export async function getBlogListing(locale: Locale): Promise<BlogListingItem[]> {
  const native = await getBlogPosts(locale);
  const en = await getBlogPosts(DEFAULT_LOCALE);
  const nativeByKey = indexByTranslationKey(native);
  const enByKey = indexByTranslationKey(en);

  const keys = new Set<string>([...nativeByKey.keys(), ...enByKey.keys()]);
  const items: BlogListingItem[] = [];

  for (const key of keys) {
    const nativePost = nativeByKey.get(key);
    if (nativePost) {
      items.push({ slug: nativePost.slug, post: nativePost, contentLocale: locale, fallback: false });
      continue;
    }
    const enPost = enByKey.get(key);
    if (enPost) {
      items.push({ slug: enPost.slug, post: enPost, contentLocale: DEFAULT_LOCALE, fallback: true });
    }
  }

  items.sort((a, b) => b.post.date.getTime() - a.post.date.getTime());
  return items;
}

/**
 * The homepage blog teaser: the three newest posts for the locale (native, or
 * the English post as a fallback), newest first.
 *
 * Same order and same numbering as `getBlogListing`, so the 01 row on the
 * homepage, the 01 row on the blog index and the `BLOG / 01` label on the
 * article page all point at the same post.
 */
export async function getHomepagePosts(locale: Locale): Promise<BlogListingItem[]> {
  const listing = await getBlogListing(locale);
  return listing.slice(0, 3);
}

/** A blog listing item resolved to its raw collection entry (for markdown). */
export interface BlogEntry {
  slug: string;
  entry: any;
  contentLocale: Locale;
  fallback: boolean;
}

/**
 * Resolve the raw collection entries backing the blog listing for a locale, so
 * a route can render each entry's markdown body. Mirrors `getBlogListing`:
 * native entries first, English fallbacks otherwise. Drafts are filtered in
 * production, exactly like `getBlogPosts`.
 */
export async function getBlogEntries(locale: Locale): Promise<BlogEntry[]> {
  const all = await getCollection('blog');
  const isProduction = import.meta.env.PROD;
  const visible = all.filter((entry) => !isProduction || !entry.data.draft);

  const indexEntries = (entries: typeof visible) => {
    const map = new Map<string, (typeof visible)[number]>();
    for (const entry of entries) {
      const { slug } = splitId(entry.id);
      const key = entry.data.translationKey || slug;
      if (!map.has(key)) map.set(key, entry);
    }
    return map;
  };

  const nativeByKey = indexEntries(visible.filter((entry) => splitId(entry.id).locale === locale));
  const enByKey = indexEntries(visible.filter((entry) => splitId(entry.id).locale === DEFAULT_LOCALE));

  const keys = new Set<string>([...nativeByKey.keys(), ...enByKey.keys()]);
  const out: BlogEntry[] = [];

  for (const key of keys) {
    const nativeEntry = nativeByKey.get(key);
    if (nativeEntry) {
      out.push({ slug: splitId(nativeEntry.id).slug, entry: nativeEntry, contentLocale: locale, fallback: false });
      continue;
    }
    const enEntry = enByKey.get(key);
    if (enEntry) {
      out.push({ slug: splitId(enEntry.id).slug, entry: enEntry, contentLocale: DEFAULT_LOCALE, fallback: true });
    }
  }

  out.sort((a, b) => new Date(b.entry.data.date).getTime() - new Date(a.entry.data.date).getTime());
  return out;
}
