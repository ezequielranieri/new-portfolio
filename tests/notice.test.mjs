// Saved-choice notice verification.
//
//   URL=http://127.0.0.1:4324/ npm run test:notice
import assert from 'node:assert/strict';

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');

let failures = 0;
function ok(label, cond) {
  if (cond) console.log('ok   ' + label);
  else { failures += 1; console.log('FAIL ' + label); }
}

const routes = ['/', '/blog/', '/blog/aegis-secure-ai-agents/'];
const viewports = [[1366, 650], [1024, 650], [390, 844], [320, 568]];

for (const route of routes) {
  for (const [w, h] of viewports) {
    // Test 1: notice appears when saved locale differs from page locale
    {
      const { chromium } = await import('playwright-core');
      const { launchOptions } = await import('/home/ez/new-portfolio/odd/responsive/harness/browser.js');
      const browser = await chromium.launch(launchOptions());
      const page = await browser.newPage();
      await page.setViewportSize({ width: w, height: h });
      await page.goto(new URL(route, BASE).href, { waitUntil: 'load' });
      const pageLocale = route.startsWith('/es/') ? 'es' : 'en';
      const savedLocale = pageLocale === 'en' ? 'es' : 'en';
      await page.evaluate((sl) => localStorage.setItem('preferred-locale', sl), savedLocale);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(300);

      const visible = await page.locator('#saved-choice-notice').evaluate((el) => !el.hasAttribute('hidden'));
      ok(route + '@' + w + 'x' + h + ' notice visible on mismatch', visible);

      // URL should not change (no redirect)
      const url = page.url();
      ok(route + '@' + w + 'x' + h + ' no redirect', url.includes(route.replace(/^\//, '')));

      // Dismiss by Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const dismissedEsc = await page.locator('#saved-choice-notice').evaluate((el) => el.hasAttribute('hidden'));
      ok(route + '@' + w + 'x' + h + ' dismissed by Escape', dismissedEsc);

      await browser.close();
    }

    // Test 2: notice does NOT appear when saved locale matches page locale
    {
      const { chromium } = await import('playwright-core');
      const { launchOptions } = await import('/home/ez/new-portfolio/odd/responsive/harness/browser.js');
      const browser = await chromium.launch(launchOptions());
      const page = await browser.newPage();
      await page.setViewportSize({ width: w, height: h });
      await page.goto(new URL(route, BASE).href, { waitUntil: 'load' });
      const pageLocale = route.startsWith('/es/') ? 'es' : 'en';
      await page.evaluate((sl) => localStorage.setItem('preferred-locale', sl), pageLocale);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(300);

      const visible = await page.locator('#saved-choice-notice').evaluate((el) => !el.hasAttribute('hidden'));
      ok(route + '@' + w + 'x' + h + ' notice hidden on match', !visible);

      await browser.close();
    }

    // Test 3: bounding-box check against fixed elements
    {
      const { chromium } = await import('playwright-core');
      const { launchOptions } = await import('/home/ez/new-portfolio/odd/responsive/harness/browser.js');
      const browser = await chromium.launch(launchOptions());
      const page = await browser.newPage();
      await page.setViewportSize({ width: w, height: h });
      await page.goto(new URL(route, BASE).href, { waitUntil: 'load' });
      const pageLocale = route.startsWith('/es/') ? 'es' : 'en';
      const savedLocale = pageLocale === 'en' ? 'es' : 'en';
      await page.evaluate((sl) => localStorage.setItem('preferred-locale', sl), savedLocale);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(300);

      const data = await page.evaluate(() => {
        const notice = document.querySelector('#saved-choice-notice');
        if (!notice || notice.hasAttribute('hidden')) return null;
        const nr = notice.getBoundingClientRect();
        const fixed = document.querySelectorAll('header.fixed-header, .fixed-social, .fixed-scroll, .back-to-top');
        const overlaps = [];
        for (const el of fixed) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // Check overlap
          const overlapX = nr.left < r.right && nr.right > r.left;
          const overlapY = nr.top < r.bottom && nr.bottom > r.top;
          if (overlapX && overlapY) overlaps.push(el.className);
        }
        return { notice: { left: nr.left, right: nr.right, top: nr.top, bottom: nr.bottom }, overlaps };
      });

      if (data) {
        ok(route + '@' + w + 'x' + h + ' no overlap with fixed elements', data.overlaps.length === 0);
      }

      await browser.close();
    }
  }
}

console.log(failures === 0 ? '\nnotice check: OK' : `\nnotice check: FAILED (${failures})`);
process.exit(failures > 0 ? 1 : 0);