// Route-driven shared-header verification for the static build.
//
// Commit e0849e2 extracted the header into src/components/SiteHeader.astro and
// rendered it on every route. These assertions pin that contract: each route
// renders exactly one shared header, and the header's controls stay inside the
// viewport across the responsive tier set. Copy, accessible names and language
// labels are read from the dictionaries, never hardcoded.
//
//   URL=http://127.0.0.1:4324/ npm run test:routes
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const launchOptions = () => ({ headless: true, args: ['--no-sandbox'] });

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const es = JSON.parse(readFileSync(new URL('../src/i18n/es.json', import.meta.url), 'utf8'));
const dict = { en, es };

// Both routes are served from the static 404 document, so the hosting layer may
// answer with either status depending on how it maps the directory-like URL.
const ROUTES = [
  { path: '/', locale: 'en', status: [200] },
  { path: '/es/', locale: 'es', status: [200] },
  { path: '/blog/', locale: 'en', status: [200] },
  { path: '/es/blog/', locale: 'es', status: [200] },
  { path: '/blog/agent-gateway/', locale: 'en', status: [200] },
  { path: '/es/blog/agent-gateway/', locale: 'es', status: [200] },
  { path: '/404/', locale: 'en', status: [200, 404] },
  { path: '/es/404/', locale: 'es', status: [200, 404] },
];

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '1024x650', width: 1024, height: 650 },
  { name: '1366x650', width: 1366, height: 650 },
];

const other = (locale) => (locale === 'es' ? 'en' : 'es');
// Each chip shows the code of the locale it points at, translated by the page's
// own locale (see LanguageSwitcher.astro), so the label comes from that dict.
const switchLabel = (pageLocale, chipLocale) =>
  dict[pageLocale].switcher[chipLocale === 'en' ? 'labelEn' : 'labelEs'];

const HEADER = 'header.fixed-header';
const LOGO = `${HEADER} .logo`;
const SWITCHER = `${HEADER} .header-switcher .language-switcher`;
const LANG_LINKS = `${SWITCHER} a.lang-link`;
const MENU_TOGGLE = `${HEADER} button.menu-toggle`;
const NAV = `${HEADER} nav.nav`;

let failures = 0;
let assertions = 0;

function eq(group, label, actual, expected) {
  assertions += 1;
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`ok   ${group} | ${label} = ${JSON.stringify(actual)}`);
  } catch {
    failures += 1;
    console.log(
      `FAIL ${group} | ${label} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
    );
  }
}

function check(group, label, pass, detail) {
  assertions += 1;
  const suffix = detail ? ` (${detail})` : '';
  if (pass) {
    console.log(`ok   ${group} | ${label}${suffix}`);
  } else {
    failures += 1;
    console.log(`FAIL ${group} | ${label}${suffix}`);
  }
}

// Read the DOM without waiting: a missing element reports null immediately.
const count = (page, selector) =>
  page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((el) => {
    let node = el;
    while (node) {
      if (getComputedStyle(node).display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  }).length, selector);
const attr = (page, selector, name) =>
  page.evaluate(
    ([s, n]) => {
      const els = Array.from(document.querySelectorAll(s));
      const el = els.find((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e.parentElement).display !== 'none') || els[0];
      return el?.getAttribute(n) ?? null;
    },
    [selector, name],
  );
const rect = (page, selector) =>
  page.evaluate((s) => {
    const els = Array.from(document.querySelectorAll(s));
    const el = els.find((e) => {
      let node = e;
      while (node) { if (getComputedStyle(node).display === 'none') return false; node = node.parentElement; }
      return true;
    }) || els[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
const langLinks = (page) =>
  page.evaluate((s) =>
    Array.from(document.querySelectorAll(s))
      .filter((a) => {
        const header = a.closest('header.fixed-header');
        return !header || (getComputedStyle(header).display !== 'none' && getComputedStyle(header.parentElement).display !== 'none');
      })
      .map((a) => ({
        text: a.textContent.trim(),
        current: a.getAttribute('aria-current') === 'true',
      })), LANG_LINKS);

const isVisible = (page, selector) =>
  page.evaluate((s) => {
    const els = Array.from(document.querySelectorAll(s));
    const el = els.find((e) => {
      let node = e;
      while (node) { if (getComputedStyle(node).display === 'none') return false; node = node.parentElement; }
      return true;
    });
    return !!el;
  }, selector);

function insideViewport(r, vp) {
  if (!r) return false;
  return (
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.width <= vp.width + 0.5 &&
    r.y + r.height <= vp.height + 0.5
  );
}
const rectStr = (r) =>
  r ? `x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.width.toFixed(1)} h=${r.height.toFixed(1)}` : 'null';

const browser = await chromium.launch(launchOptions());
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const route of ROUTES) {
      const group = `${route.path}@${vp.name}`;
      const page = await context.newPage();
      try {
        const response = await page.goto(new URL(route.path, BASE).href, { waitUntil: 'load' });
        const status = response ? response.status() : null;

        // ── 0. status: static-404 routes accept 200 or 404, the rest must be 200
        check(group, 'status in allowed set', route.status.includes(status), `status=${status} allowed=${JSON.stringify(route.status)}`);

        // ── 1. exactly one shared header, never one per locale block
        //    (the root 404.html carries both locales' headers and hides the
        //    inactive one via CSS, so count the visible ones)
        const visibleHeaderCount = await page.evaluate(() =>
          Array.from(document.querySelectorAll('header.fixed-header')).filter(
            (el) => getComputedStyle(el).display !== 'none' && getComputedStyle(el.parentElement).display !== 'none',
          ).length,
        );
        eq(group, 'header.fixed-header count', visibleHeaderCount, 1);

        // ── 2. the header is visible and fully inside the viewport
        check(group, 'header visible', await isVisible(page, HEADER));
        const headerRect = await rect(page, HEADER);
        check(group, 'header inside viewport', insideViewport(headerRect, vp), rectStr(headerRect));

        // ── 3. the logo points at the locale home and is reachable
        eq(group, 'logo exists', await count(page, LOGO), 1);
        check(group, 'logo visible', await isVisible(page, LOGO));
        const logoRect = await rect(page, LOGO);
        check(group, 'logo inside viewport', insideViewport(logoRect, vp), rectStr(logoRect));
        eq(group, 'logo href', await attr(page, LOGO, 'href'), route.locale === 'es' ? '/es/' : '/');
        eq(group, 'logo aria-label', await attr(page, LOGO, 'aria-label'), dict[route.locale].a11y.home);

        // ── 4. the switcher exposes the current locale, reachable inside the viewport
        eq(group, 'language-switcher exists', await count(page, SWITCHER), 1);
        check(group, 'language-switcher visible', await isVisible(page, SWITCHER));
        const switcherRect = await rect(page, SWITCHER);
        check(group, 'language-switcher inside viewport', insideViewport(switcherRect, vp), rectStr(switcherRect));
        const links = await langLinks(page);
        eq(group, 'lang-link count', links.length, 2);
        const currentLinks = links.filter((l) => l.current);
        eq(group, 'aria-current="true" count', currentLinks.length, 1);
        eq(group, 'current chip text', currentLinks[0]?.text ?? null, switchLabel(route.locale, route.locale));
        eq(
          group,
          'other chip text',
          links.filter((l) => !l.current)[0]?.text ?? null,
          switchLabel(route.locale, other(route.locale)),
        );

        // ── 5. tier rule: MENU below 1024, inline nav from 1024 up
        const desktop = vp.width >= 1024;
        check(group, 'menu-toggle visibility matches tier', (await isVisible(page, MENU_TOGGLE)) === !desktop, `width=${vp.width}`);
        if (!desktop) {
          const toggleRect = await rect(page, MENU_TOGGLE);
          check(group, 'menu-toggle inside viewport', insideViewport(toggleRect, vp), rectStr(toggleRect));
        }
        check(group, 'nav visibility matches tier', (await isVisible(page, NAV)) === desktop, `width=${vp.width}`);
        if (desktop) {
          const navRect = await rect(page, NAV);
          check(group, 'nav inside viewport', insideViewport(navRect, vp), rectStr(navRect));
          eq(group, 'nav aria-label', await attr(page, NAV, 'aria-label'), dict[route.locale].a11y.mainNavigation);
        }
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const combinations = ROUTES.length * VIEWPORTS.length;
console.log(`\n${combinations} route/viewport combinations, ${assertions} assertions`);
if (failures > 0) {
  console.error(`\nroutes header check: FAILED (${failures} assertion${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log('\nroutes header check: OK');
