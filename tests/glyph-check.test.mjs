// Font glyph check: render display-font glyphs and verify no fallback font.
//
//   URL=http://127.0.0.1:4324/ npm run test:glyphs
import assert from 'node:assert/strict';

const BASE = (process.env.URL || 'http://127.0.0.1:4324/').replace(/\/?$/, '/');

let failures = 0;
function ok(label, cond) {
  if (cond) console.log('ok   ' + label);
  else { failures += 1; console.log('FAIL ' + label); }
}

const { chromium } = await import('playwright-core');
const { launchOptions } = await import('/home/ez/new-portfolio/odd/responsive/harness/browser.js');
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();
await page.goto(new URL('/', BASE).href, { waitUntil: 'load' });

const glyphs = 'ÁÉÍÓÚÜÑ¿¡';
const fonts = [
  { family: 'Syne', weight: '800' },
  { family: 'Inter', weight: '600' },
];

for (const { family, weight } of fonts) {
  const result = await page.evaluate(({ font, weight, glyphs }) => {
    return document.fonts.check(`${weight} 24px ${font}`) && 
           (function() {
             const canvas = document.createElement('canvas');
             const ctx = canvas.getContext('2d');
             ctx.font = `${weight} 24px ${font}`;
             return ctx.measureText(glyphs).width > 0;
           })();
  }, { font: family, weight, glyphs });
  ok(family + ' ' + weight + ' glyphs render', result);
}

await browser.close();

console.log(failures === 0 ? '\nglyph check: OK' : `\nglyph check: FAILED (${failures})`);
process.exit(failures > 0 ? 1 : 0);