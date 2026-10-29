/**
 * Discover the published articles of the built site.
 *
 * The blog exists behind a content pipeline: a slug only gets a public route
 * when its frontmatter marks it published, so any assertion hardcoded to one
 * slug breaks the moment content is renamed, drafted or deleted. Reading the
 * rendered indexes keeps these tests coupled to what is actually live, not to
 * yesterday's content.
 *
 *   const articles = await publishedArticles('http://127.0.0.1:4324/');
 *   articles.en    // ['/blog/aegis/', ...]
 *   articles.es    // ['/es/blog/aegis/', ...]
 *
 * Returns plain route paths (with trailing slash) so they double as fetch URLs.
 */
export async function publishedArticles(BASE) {
  const base = BASE.replace(/\/?$/, '/');
  const slugs = async (path, prefix) => {
    const res = await fetch(new URL(path, base).href);
    if (!res.ok) return [];
    const html = await res.text();
    return [...new Set([...html.matchAll(new RegExp(`href=${prefix}([a-z0-9-]+)/`, 'g'))].map((m) => m[1]))];
  };

  const en = await slugs('/blog/', '"\\/blog\\/([a-z0-9-]+)\\/');
  const es = await slugs('/es/blog/', '"\\/es\\/blog\\/([a-z0-9-]+)\\/');
  return { en: en.map((s) => `/blog/${s}/`), es: es.map((s) => `/es/blog/${s}/`) };
}
