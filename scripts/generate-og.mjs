#!/usr/bin/env node
// Generates the Open Graph card set: one default cover plus one card per
// article and locale.
//
// Why a committed generator instead of a build-time rasterizer:
//   - satori cannot load this repo's fonts (it needs ttf/otf/woff, and the site
//     ships woff2 only), and astro-og-canvas adds a canvas WASM dependency to
//     every build.
//   - Rendering with the browser we already use for tests means the card uses
//     the real Syne/Inter faces and the real design tokens, not an imitation.
//   - The PNGs are static files, so the build stays fast and a broken renderer
//     can never fail a deploy.
//
// Run after editing an article title or the layout:  node scripts/generate-og.mjs
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public/og');
const CONTENT = join(ROOT, 'src/content/blog');

const WIDTH = 1200;
const HEIGHT = 630;

// Design tokens, mirrored from src/styles/global.css. Kept as literals on
// purpose: the card must not change because a token was retuned for the site.
const C = {
  bg: '#0a0a0c',
  surface: '#111113',
  line: '#1f1f22',
  text: '#ffffff',
  text2: '#b5b5ba',
  text3: '#8a8a8f',
  chrome:
    'linear-gradient(110deg, #ffffff 0%, #dbe8ff 10%, #9ec3ff 24%, #9ec3ff 36%, #ffffff 46%, #e3c9ff 56%, #ffb8ec 68%, #a9bcff 80%, #eaf1ff 90%, #ffffff 100%)',
};

const font = (file) => readFileSync(join(ROOT, 'public/fonts', file)).toString('base64');
const SYNE = font('syne-latin-wght-normal.woff2');
const INTER = font('inter-latin-wght-normal.woff2');

/** Font size that keeps a title readable without letting it run off the card. */
function titleSize(title) {
  if (title.length <= 45) return 78;
  if (title.length <= 68) return 66;
  if (title.length <= 92) return 56;
  return 48;
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shell(body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Syne"; font-weight: 400 800; src: url(data:font/woff2;base64,${SYNE}) format("woff2"); }
  @font-face { font-family: "Inter"; font-weight: 100 900; src: url(data:font/woff2;base64,${INTER}) format("woff2"); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: ${C.bg}; color: ${C.text};
    font-family: "Inter", sans-serif;
    position: relative;
  }
  /* Chrome glow, same iridescence as the site's text treatment */
  .glow {
    position: absolute; width: 900px; height: 900px; right: -380px; top: -480px;
    background: radial-gradient(circle, rgba(158,195,255,0.20) 0%, rgba(227,201,255,0.10) 38%, rgba(10,10,12,0) 68%);
    border-radius: 50%;
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(to right, ${C.line} 1px, transparent 1px),
      linear-gradient(to bottom, ${C.line} 1px, transparent 1px);
    background-size: 100px 100px;
    opacity: 0.55;
    mask-image: radial-gradient(ellipse at 70% 30%, #000 0%, transparent 72%);
    -webkit-mask-image: radial-gradient(ellipse at 70% 30%, #000 0%, transparent 72%);
  }
  .frame { position: absolute; inset: 32px; border: 1px solid ${C.line}; }
  .content { position: absolute; inset: 72px; display: flex; flex-direction: column; }
  .eyebrow {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 17px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase;
    color: ${C.text3};
  }
  .eyebrow b { color: ${C.text2}; font-weight: 500; }
  .title {
    font-family: "Syne", sans-serif; font-weight: 800; letter-spacing: -0.02em;
    line-height: 1.06; margin-top: auto; margin-bottom: auto; text-wrap: balance;
    max-width: 1000px;
  }
  .footer { display: flex; align-items: center; gap: 20px; font-size: 18px; color: ${C.text3}; }
  .bar { height: 2px; flex: 0 0 56px; background: ${C.chrome}; }
  .footer b { color: ${C.text2}; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; font-size: 15px; }
  .footer span { margin-left: auto; letter-spacing: 0.06em; }
  .wordmark {
    font-family: "Syne", sans-serif; font-weight: 800; letter-spacing: -0.05em;
    background: ${C.chrome}; background-size: 250% 100%;
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
</style></head><body>
  <div class="glow"></div>
  <div class="grid"></div>
  <div class="frame"></div>
  ${body}
</body></html>`;
}

function coverCard() {
  return shell(`
  <div class="content">
    <div class="eyebrow"><span><b>Ezequiel Ranieri</b></span><span>Portfolio</span></div>
    <div style="display:flex; align-items:flex-end; gap:44px; margin-top:auto;">
      <div class="wordmark" style="font-size:300px; line-height:0.78;">ER</div>
      <div style="padding-bottom:28px;">
        <div style="font-family:'Syne',sans-serif; font-size:40px; font-weight:600; letter-spacing:-0.01em;">AI Security Engineer</div>
        <div style="font-size:22px; color:${C.text2}; margin-top:10px; max-width:560px; line-height:1.35;">
          Backend &amp; security infrastructure for AI agents
        </div>
      </div>
    </div>
    <div class="footer" style="margin-top:auto;">
      <div class="bar"></div><b>Secure AI agents · Non-human identity · IAM</b>
      <span>ezequielranieri.vercel.app</span>
    </div>
  </div>`);
}

function articleCard(title, locale) {
  const label = locale === 'es' ? 'Notas' : 'Notes';
  return shell(`
  <div class="content">
    <div class="eyebrow"><span><b>Ezequiel Ranieri</b></span><span>${label}</span></div>
    <div class="title" style="font-size:${titleSize(title)}px;">${esc(title)}</div>
    <div class="footer">
      <div class="bar"></div><b>${locale === 'es' ? 'Seguridad de IA' : 'AI Security'}</b>
      <span>ezequielranieri.vercel.app</span>
    </div>
  </div>`);
}

/** Frontmatter of every published article, per locale. */
function collectArticles() {
  const items = [];
  for (const locale of readdirSync(CONTENT)) {
    for (const file of readdirSync(join(CONTENT, locale))) {
      const { data } = matter(readFileSync(join(CONTENT, locale, file), 'utf8'));
      if (data.draft) continue;
      items.push({ locale, slug: file.replace(/\.md$/, ''), title: data.title });
    }
  }
  return items;
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

async function render(html, outPath) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(join(outPath, '..'), { recursive: true });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log('  ' + outPath.slice(ROOT.length));
}

await render(coverCard(), join(OUT, 'default.png'));

for (const article of collectArticles()) {
  await render(
    articleCard(article.title, article.locale),
    join(OUT, 'blog', article.locale, `${article.slug}.png`)
  );
}

await browser.close();
console.log('OK');
