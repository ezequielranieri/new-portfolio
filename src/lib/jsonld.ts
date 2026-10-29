/**
 * JSON-LD structured data builders for blog articles.
 * Kept separate to avoid i18n checker flagging schema.org vocabulary.
 */

import type { BlogPost } from './blog';
import { getBlogIndexCanonicalUrl, blogPostPath } from './blog';
import type { Locale } from '@/i18n';
import { SITE_URL, SITE_NAME, SOCIAL } from '@/config/site';
import { articleOgImage } from './og';
import { absoluteUrl } from './url';

/**
 * Topics the person is publicly shown working with. Proper nouns and field
 * names, so they stay identical across locales — translating "SPIFFE/SPIRE"
 * would invent terminology nobody searches for.
 */
const KNOWS_ABOUT = [
  'AI security',
  'Non-Human Identity',
  'Identity and Access Management',
  'capability-based security',
  'distributed systems',
  'SPIFFE/SPIRE',
  'OPA/Cedar',
  'Kubernetes',
  'Go',
];

/**
 * Identity graph for the home page: who the site is about and what the site is.
 *
 * A single `@graph` keeps both nodes in one script tag and lets the site
 * reference the person by `@id` instead of repeating the same object.
 */
export function buildHomeJsonLd(locale: Locale, jobTitle: string, description: string): object {
  const homeUrl = absoluteUrl('/', locale);
  const personId = `${SITE_URL}/#person`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: SITE_NAME,
        url: homeUrl,
        jobTitle,
        description,
        sameAs: [SOCIAL.github, SOCIAL.linkedin, SOCIAL.x],
        knowsAbout: KNOWS_ABOUT,
        // Country only: the request was an identity signal, not a postal address.
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'AR',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: homeUrl,
        description,
        inLanguage: locale,
        publisher: { '@id': personId },
      },
    ],
  };
}

export interface JsonLdArticle {
  '@context': string;
  '@type': string;
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  author: {
    '@type': string;
    name: string;
  };
  publisher: {
    '@type': string;
    name: string;
    url: string;
  };
  mainEntityOfPage: {
    '@type': string;
    '@id': string;
  };
  image: string;
}

export function buildArticleJsonLd(post: BlogPost, canonicalUrl: string): JsonLdArticle {
  // `url` and `mainEntityOfPage` are the canonical URL by definition: taking it
  // as an argument makes it impossible for the structured data to advertise a
  // different language (or host) than the page it describes.
  const ogImage = articleOgImage(post.lang, post.slug);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    url: canonicalUrl,
    datePublished: post.date.toISOString(),
    // A manual `updatedDate` only counts when it post-dates publication;
    // otherwise dateModified would be earlier than datePublished.
    dateModified: (post.updatedDate && post.updatedDate.getTime() > post.date.getTime()
      ? post.updatedDate
      : post.date
    ).toISOString(),
    author: { '@type': 'Person', name: SITE_NAME },
    publisher: {
      '@type': 'Person',
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    image: ogImage,
  };
}

export function buildBlogJsonLd(posts: BlogPost[], locale: Locale = 'en'): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `Blog · ${SITE_NAME}`,
    description: 'Technical deep-dives, case studies and architecture decisions',
    url: getBlogIndexCanonicalUrl(locale),
    publisher: {
      '@type': 'Person',
      name: SITE_NAME,
      url: SITE_URL,
    },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.excerpt,
      url: `${SITE_URL}${blogPostPath(locale, p.slug)}`,
      datePublished: p.date.toISOString(),
      author: { '@type': 'Person', name: SITE_NAME },
    })),
  };
}