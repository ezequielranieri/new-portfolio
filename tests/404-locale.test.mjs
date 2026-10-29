// Locale-aware 404 verification for the static build.
//
// A static build emits a single root 404.html, and the hosting layer answers
// every unmatched URL with it. That page therefore carries both locales plus an
// inline <head> script that selects the right one before the first paint. These
// assertions pin that behaviour against the dictionaries (never hardcoded copy).
//
//   URL=http://127.0.0.1:4324/ npm run test:404
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const launchOptions = () => ({ headless: true, args: ['--no-sandbox'] });

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const es = JSON.parse(readFileSync(new URL('../src/i18n/es.json', import.meta.url), 'utf8'));

let failures = 0;

function eq(group, label, actual, expected) {
  try {
    assert.strictEqual(actual, expected);
    console.log(`ok   ${group} | ${label} = ${JSON.stringify(actual)}`);
  } catch {
    failures += 1;
    console.log(
      `FAIL ${group} | ${label} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
    );
  }
}

async function visit(browser, path) {
  const page = await browser.newPage();
  const response = await page.goto(new URL(path, BASE).href, { waitUntil: 'load' });
  // The locale script runs while <head> is parsed; 'load' guarantees it has run.
  await page.waitForLoadState('load');
  return { page, status: response ? response.status() : null };
}

const visible = (page, selector) => page.locator(selector).isVisible();
// Read text without waiting: a missing block must report null, not stall 30s.
const text = (page, selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, selector);
const lang = (page) => page.evaluate(() => document.documentElement.lang);
const title = (page) => page.evaluate(() => document.title);
const metaContent = (page, name) =>
  page.evaluate((n) => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? null, name);

const browser = await chromium.launch(launchOptions());
try {
  // ── 1. bogus /es/ URL must render the Spanish 404 ─────────────────────────
  {
    const { page, status } = await visit(browser, 'es/__no-such-route__/');
    eq('es-bogus', 'status', status, 404);
    eq('es-bogus', 'documentElement.lang', await lang(page), 'es');
    eq('es-bogus', 'document.title', await title(page), es.notFound.meta.title);
    eq('es-bogus', 'es block visible', await visible(page, 'section[data-notfound-locale="es"]'), true);
    eq('es-bogus', 'es .error-text', await text(page, 'section[data-notfound-locale="es"] .error-text'), es.notFound.message);
    eq('es-bogus', 'en block visible', await visible(page, 'section[data-notfound-locale="en"]'), false);
    eq('es-bogus', 'robots meta', await metaContent(page, 'robots'), 'noindex');
    await page.close();
  }

  // ── 2. bogus English URL must render the English 404 ──────────────────────
  {
    const { page, status } = await visit(browser, '__no-such-route__/');
    eq('en-bogus', 'status', status, 404);
    eq('en-bogus', 'documentElement.lang', await lang(page), 'en');
    eq('en-bogus', 'document.title', await title(page), en.notFound.meta.title);
    eq('en-bogus', 'en block visible', await visible(page, 'section[data-notfound-locale="en"]'), true);
    eq('en-bogus', 'en .error-text', await text(page, 'section[data-notfound-locale="en"] .error-text'), en.notFound.message);
    eq('en-bogus', 'es block visible', await visible(page, 'section[data-notfound-locale="es"]'), false);
    await page.close();
  }

  // ── 3. /es/404/ regression guard: the Spanish route keeps working ─────────
  {
    const { page, status } = await visit(browser, 'es/404/');
    eq('es-route', 'status', status, 200);
    eq('es-route', 'documentElement.lang', await lang(page), 'es');
    eq('es-route', '.error-text', await text(page, '.error-text'), es.notFound.message);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n404 locale check: FAILED (${failures} assertion${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log('\n404 locale check: OK');
