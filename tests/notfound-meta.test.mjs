// 404 page meta verification: no canonical, no hreflang, only noindex.
//
//   URL=http://127.0.0.1:4324/ npm run test:notfound-meta
import assert from 'node:assert/strict';

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');

let failures = 0;
function ok(label, cond) {
  if (cond) console.log('ok   ' + label);
  else { failures += 1; console.log('FAIL ' + label); }
}

for (const route of ['/404/', '/es/404/']) {
  const res = await fetch(new URL(route, BASE).href);
  const html = await res.text();
  ok(route + ' no canonical', !html.includes('rel="canonical"'));
  ok(route + ' no hreflang', !html.includes('rel="alternate" hreflang'));
  ok(route + ' has noindex', html.includes('name="robots" content="noindex"'));
}

console.log(failures === 0 ? '\nnotfound-meta check: OK' : `\nnotfound-meta check: FAILED (${failures})`);
process.exit(failures > 0 ? 1 : 0);