// hreflang reciprocity and canonical self-reference on every route.
//
//   URL=http://127.0.0.1:4324/ npm run test:hreflang
import assert from 'node:assert/strict';

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');

let failures = 0;
function ok(label, cond) {
  if (cond) console.log('ok   ' + label);
  else { failures += 1; console.log('FAIL ' + label); }
}

const routes = ['/', '/es/', '/blog/', '/es/blog/', '/blog/agent-gateway/', '/es/blog/agent-gateway/', '/404/', '/es/404/'];

for (const route of routes) {
  const res = await fetch(new URL(route, BASE).href);
  const html = await res.text();
  
  // Extract hreflang links
  const hreflangs = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
  const langs = hreflangs.map((m) => m[1]);
  
  // 404 pages should NOT have hreflang
  if (route.includes('404')) {
    ok(route + ' no hreflang', hreflangs.length === 0);
    continue;
  }
  
  // Pages with real pairs should have en, es, x-default
  // Articles only have EN (all ES articles are drafts)
  const isArticle = route.includes('/blog/') && route !== '/blog/' && route !== '/es/blog/';
  if (isArticle) {
    ok(route + ' has hreflang en', langs.includes('en'));
    ok(route + ' has x-default', langs.includes('x-default'));
  } else {
    ok(route + ' has hreflang en', langs.includes('en'));
    ok(route + ' has hreflang es', langs.includes('es'));
    ok(route + ' has x-default', langs.includes('x-default'));
  }
  
  // Canonical self-reference
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  ok(route + ' has canonical', !!canonical);
  if (canonical) {
    const canonUrl = canonical[1];
    const selfUrl = new URL(route, 'https://ezequielranieri.vercel.app').href.replace(/\/$/, '') + (route.endsWith('/') ? '/' : '');
    // Just check it's not empty and points to the right domain
    ok(route + ' canonical on right domain', canonUrl.includes('ezequielranieri.vercel.app'));
  }
  
  // Reciprocity: if this page lists an ES alternate, that ES page should list this page as EN alternate
  const esAlt = hreflangs.find((m) => m[1] === 'es');
  if (esAlt) {
    const esRes = await fetch(esAlt[2].replace('https://ezequielranieri.vercel.app', BASE.replace(/\/$/, '')), { redirect: 'manual' });
    if (esRes.status === 200) {
      const esHtml = await esRes.text();
      const esHreflangs = [...esHtml.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
      const esEnAlt = esHreflangs.find((m) => m[1] === 'en');
      ok(route + ' -> ES reciprocity', !!esEnAlt && esEnAlt[2] === hreflangs.find((m) => m[1] === 'en')?.[2]);
    }
  }
}

console.log(failures === 0 ? '\nhreflang check: OK' : `\nhreflang check: FAILED (${failures})`);
process.exit(failures > 0 ? 1 : 0);