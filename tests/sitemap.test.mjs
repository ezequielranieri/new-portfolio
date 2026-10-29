// Sitemap verification for the static build.
//
//   URL=http://127.0.0.1:4324/ npm run test:sitemap
import assert from 'node:assert/strict';

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');

let failures = 0;
function ok(label, cond) {
  if (cond) console.log('ok   ' + label);
  else { failures += 1; console.log('FAIL ' + label); }
}

const xml = await (async () => {
  const res = await fetch(new URL('sitemap.xml', BASE).href);
  return res.text();
})();

// Parse URLs and extract paths
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const paths = urls.map((u) => new URL(u).pathname);
const alternates = [...xml.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)];

console.log('sitemap URLs:', urls.length);

// Every URL path must be reachable locally (200, not 404, not redirect)
for (const p of paths) {
  const res = await fetch(new URL(p, BASE).href, { redirect: 'manual' });
  ok('reachable ' + p, res.status === 200);
  ok('no redirect ' + p, res.status !== 301 && res.status !== 302);
}

// Verify no duplicate paths
const unique = new Set(paths);
ok('no duplicate paths', unique.size === paths.length);

// Verify x-default present
ok('x-default present', xml.includes('hreflang="x-default"'));

// Verify alternates are bidirectional: for each ES URL, its EN alternate exists
const altPairs = [];
for (const [, lang, href] of alternates) {
  altPairs.push({ lang, href, path: new URL(href).pathname });
}

// Check that every ES URL in the sitemap has a corresponding EN alternate
const esPaths = paths.filter((p) => p.startsWith('/es/'));
for (const esPath of esPaths) {
  const enPath = esPath.replace(/^\/es(\/|$)/, '/');
  ok('es->en alternate exists for ' + esPath, paths.includes(enPath));
}

// Check that every EN URL with an ES alternate has the reverse
const enPathsWithEsAlt = new Set();
for (const { lang, path: altPath } of altPairs) {
  if (lang === 'es') {
    const enPath = altPath.replace(/^\/es(\/|$)/, '/');
    enPathsWithEsAlt.add(enPath);
  }
}
for (const enPath of enPathsWithEsAlt) {
  ok('en->es alternate exists for ' + enPath, paths.includes('/es' + (enPath === '/' ? '/' : enPath)));
}

console.log(failures === 0 ? '\nsitemap check: OK' : `\nsitemap check: FAILED (${failures})`);
process.exit(failures > 0 ? 1 : 0);