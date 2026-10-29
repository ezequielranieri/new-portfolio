// SEO surface: Open Graph images, alternate locales, and JSON-LD identity.
//
//   URL=http://127.0.0.1:4324/ npm run test:seo
//
// Runs against the built site, because every one of these defects is only
// observable in the emitted HTML: a missing og:image file, an alternate locale
// that repeats the page's own, or structured data pointing at the wrong
// language.
import assert from 'node:assert/strict';

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');
const SITE = 'https://ezequielranieri.vercel.app';

let failures = 0;
function ok(label, cond) {
  if (cond) console.log('ok   ' + label);
  else { failures += 1; console.log('FAIL ' + label); }
}

const toLocal = (absolute) => absolute.replace(SITE, BASE.replace(/\/$/, ''));

const routes = [
  { route: '/', home: true },
  { route: '/es/', home: true },
  { route: '/blog/' },
  { route: '/es/blog/' },
  { route: '/blog/aegis/' },
  { route: '/es/blog/aegis/' },
];

const pages = new Map();
for (const { route } of routes) {
  const res = await fetch(new URL(route, BASE).href);
  ok(route + ' responds 200', res.status === 200);
  pages.set(route, await res.text());
}

// ── Open Graph image ───────────────────────────────────────────────────────
for (const [route, html] of pages) {
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const tw = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];
  const w = html.match(/<meta property="og:image:width" content="([^"]+)"/)?.[1];
  const h = html.match(/<meta property="og:image:height" content="([^"]+)"/)?.[1];

  ok(route + ' has og:image', Boolean(og));
  ok(route + ' twitter:image matches og:image', Boolean(tw) && tw === og);
  ok(route + ' declares 1200x630', w === '1200' && h === '630');

  if (og) {
    const img = await fetch(toLocal(og));
    ok(route + ' og:image resolves', img.status === 200);
    ok(route + ' og:image is a PNG', (img.headers.get('content-type') || '').includes('image/png'));
  }
}

// The dead references that motivated this: no page may point at a card that
// was never generated.
for (const [route, html] of pages) {
  ok(route + ' has no dead og-*.jpg', !/\/og-[a-z0-9-]+\.jpg/.test(html));
}

// Articles get their own card, in their own language.
ok('/blog/aegis/ uses the EN article card', pages.get('/blog/aegis/').includes(`${SITE}/og/blog/en/aegis.png`));
ok('/es/blog/aegis/ uses the ES article card', pages.get('/es/blog/aegis/').includes(`${SITE}/og/blog/es/aegis.png`));

// ── og:locale:alternate ────────────────────────────────────────────────────
for (const [route, html] of pages) {
  const own = html.match(/<meta property="og:locale" content="([^"]+)"/)?.[1];
  const alts = [...html.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map((m) => m[1]);
  ok(route + ' alternate locale excludes own', Boolean(own) && !alts.includes(own));
  ok(route + ' declares exactly one alternate', alts.length === 1);
}

// ── JSON-LD identity (home) ────────────────────────────────────────────────
function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

for (const [route, expectedUrl] of [['/', `${SITE}/`], ['/es/', `${SITE}/es/`]]) {
  const graph = jsonLdBlocks(pages.get(route)).find((b) => b['@graph'])['@graph'];
  const person = graph.find((n) => n['@type'] === 'Person');
  const site = graph.find((n) => n['@type'] === 'WebSite');

  ok(route + ' Person present', Boolean(person));
  ok(route + ' WebSite present', Boolean(site));
  ok(route + ' Person url is localized', person.url === expectedUrl);
  ok(route + ' WebSite url is localized', site.url === expectedUrl);
  ok(route + ' WebSite language is set', site.inLanguage === (route === '/' ? 'en' : 'es'));
  ok(route + ' Person has a job title', typeof person.jobTitle === 'string' && person.jobTitle.length > 0);
  ok(route + ' sameAs covers GitHub, LinkedIn and X', person.sameAs.length === 3 && person.sameAs.every((u) => /github|linkedin|x\.com/.test(u)));
  ok(route + ' knowsAbout is non-empty', Array.isArray(person.knowsAbout) && person.knowsAbout.length >= 5);
  ok(route + ' address is country-only', person.address?.addressCountry === 'AR' && !person.address.streetAddress);
  ok(route + ' declares no telephone', !('telephone' in person));
}

// ── JSON-LD article URLs ───────────────────────────────────────────────────
for (const [route, expectedUrl] of [
  ['/blog/aegis/', `${SITE}/blog/aegis/`],
  ['/es/blog/aegis/', `${SITE}/es/blog/aegis/`],
]) {
  const html = pages.get(route);
  const article = jsonLdBlocks(html).find((b) => b['@type'] === 'BlogPosting');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

  ok(route + ' article url is localized', article.url === expectedUrl);
  ok(route + ' mainEntityOfPage matches url', article.mainEntityOfPage['@id'] === expectedUrl);
  ok(route + ' structured data agrees with canonical', article.url === canonical);
  ok(route + ' article image is a real card', /\/og\/blog\/(en|es)\/[a-z0-9-]+\.png$/.test(article.image));
}

console.log(failures === 0 ? '\nseo check: OK' : `\nseo check: FAILED (${failures})`);
process.exit(failures > 0 ? 1 : 0);
