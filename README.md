# ezequielranieri.com — portfolio

Personal site of Ezequiel Ranieri, AI security engineer: a single-page portfolio,
a bilingual blog (`/` in English, `/es/` in Spanish), and a contact form backed
by Resend.

Built as a static Astro site. The only server code is the contact endpoint,
deployed as a Vercel function.

## Stack

| Layer | Choice |
|---|---|
| Framework | [Astro](https://docs.astro.build) 7 (`output: 'static'`, pinned to `7.4.1` exactly) |
| Language | TypeScript, `.astro` components, no UI framework |
| Styling | Hand-written CSS in `src/styles/global.css`, design tokens as custom properties |
| Content | Astro content collections, Markdown in `src/content/blog/{en,es}` and `src/content/projects/{en,es}` |
| Markdown pipeline | remark/rehype + GFM, slugged headings, build-time TOC |
| i18n | `src/i18n/{en,es}.json` + a parity checker that fails the test run on drift |
| Email | Resend |
| Rate limiting | Upstash Redis (optional; falls back to per-instance memory) |
| Anti-bot | Cloudflare Turnstile (optional; disabled without keys) |
| Tests | Vitest for server logic, plain Node scripts for the rendered HTML, Playwright for visual gates |
| Hosting | Vercel |

Node **>= 22.22.0**.

## Project structure

```text
.
├── public/
│   ├── fonts/            Syne + Inter (self-hosted, woff2)
│   └── og/               Generated Open Graph cards: default.png + blog/{en,es}/*.png
├── scripts/
│   ├── check-i18n.mjs    Dictionary parity, hardcoded copy, stale keys
│   ├── check-links.mjs   HEAD-checks every external link in content and source
│   ├── generate-og.mjs   Renders the OG card set with Playwright
│   ├── test-all.mjs      Runs every suite against a local server
│   └── test-all-server.mjs  Static server that emulates the Vercel routing layer
├── src/
│   ├── components/
│   │   ├── pages/        HomePage, BlogIndexPage, ArticlePage, NotFoundPage
│   │   ├── SiteHeader.astro, LanguageSwitcher.astro, BlogRow.astro, BackToTop.astro
│   ├── config/site.ts    Site URL, social links, contact details
│   ├── content/          Markdown posts and projects, one directory per locale
│   ├── i18n/             en.json, es.json, typed translator
│   ├── layouts/BaseLayout.astro   Head, meta tags, JSON-LD, skip link
│   ├── lib/              Blog queries, URL helpers, JSON-LD, OG paths, contact/rate-limit/turnstile guards
│   ├── pages/            Routes; /es/* mirrors / and the blog; /api/contact
│   └── styles/global.css Tokens, layout, components
├── tests/                Node test scripts + Vitest suites
```

All internal links go through `src/lib/url.ts`, which enforces the
`trailingSlash: 'always'` convention so the trailing slash is never a guess.

## Getting started

```sh
npm install
astro dev --background   # then `astro dev logs`, `astro dev status`, `astro dev stop`
```

The contact form works without credentials: with no Resend or Turnstile keys the
endpoint reports the configuration problem instead of pretending to send.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Astro dev server in the foreground (`astro dev --background` to detach) |
| `npm run build` | Static build into `.vercel/output/static` |
| `npm run preview` | Serves the last `dist/client` build with `npx serve` (`astro preview` cannot run behind the Vercel adapter) |
| `npm run test` | Runs every suite against a local server serving the last build — run `npm run build` first |
| `npm run test:ci` | Same suite as CI, excluding the stale desktop visual gate |
| `npm run check:i18n` | Dictionary parity and hardcoded-copy check |
| `npm run check:links` | External-link solver: HTTP HEAD (falls back to GET) per link; a dead domain fails the run |
| `npm run test:seo` | Open Graph, alternate locales and JSON-LD assertions |
| `npm run test:routes` | Route and security-header assertions |
| `npm run test:sitemap` / `test:hreflang` / `test:404` / `test:notice` / `test:notfound-meta` | One focused HTML contract each |
| `npm run test:vitest` | Server logic: contact, email, request guards, rate limit, Turnstile |
| `npm run generate:og` | Re-renders every Open Graph card from the article titles |
| `npm run check:ts` | `astro check` over the whole tree (report-only in CI for now) |

`npm run test` needs port 4324. If a previous run left it occupied, free it first.

## Environment variables

Copy `.env.example` to `.env` for local development. Only the Resend pair is
required; everything else degrades gracefully.

| Variable | Required | Effect when missing |
|---|---|---|
| `RESEND_API_KEY` | yes (production) | The contact endpoint reports a configuration error instead of sending |
| `CONTACT_FROM_EMAIL` | yes (production) | Same as above |
| `CONTACT_TO_EMAIL` | yes (production) | Same as above |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | no | Rate limiting falls back to per-instance memory, so it is per-lambda rather than global |
| `PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | no | The widget is not rendered and verification is skipped |

`SITE_URL` is not an environment variable: it lives in `src/config/site.ts` and
feeds every canonical, `og:url`, sitemap entry and JSON-LD `@id`.

## Contact form

`POST /api/contact/` (see `src/pages/api/contact.ts`), in order:

1. **Locale** from `?locale=`, validated against an allowlist (`en`, `es`).
2. **Cross-origin guard** (`src/lib/request-guards.ts`): rejects requests whose
   `Origin` is not one of the origins the site actually runs at (request host,
   canonical site, `VERCEL_URL` preview, localhost outside production) and any
   `Sec-Fetch-Site: cross-site` request. Responses are `403` for blocked origins.
   Requests without `Origin` (curl, server-to-server) are allowed by design:
   absence is not evidence of an attack, and no session exists to protect.
3. **Rate limiting** per client IP via Upstash Redis, with an in-memory
   per-instance fallback (`429` otherwise).
4. **Turnstile verification** when keys are configured.
5. **Send** through Resend; without credentials the endpoint answers with the
   configuration problem instead of claiming success.

For local development the form answers honestly about missing credentials, and
`http://localhost:4321` is inside the origin allowlist.

## Tests

```sh
npm run build       # the HTML suites read the build output
npm run test        # everything
```

Suites that read rendered HTML and HTTP headers boot
`scripts/test-all-server.mjs`, which serves `.vercel/output/static` and replays
the headers from `vercel.json`, so a header regression is caught locally rather
than in production. The HTML tests discover the published articles from the
rendered indexes (`tests/published-articles.mjs`) instead of hardcoding slugs,
so renaming, drafting or deleting a post cannot silently break the suite.
`npm run test:ci`.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on every PR: install
(`npm ci`), build, the `test:ci` profile, a report-only `astro check`, a
blocking `npm audit --audit-level=high`, and gitleaks. `.github/dependabot.yml`
proposes weekly updates for npm and GitHub Actions.

Two policy decisions are recorded in the workflow source:

- `npm audit --audit-level=high` is blocking; the Vercel adapter chain used to
  ship `high` advisories and dependency overrides in `package.json` keep the
  audit clean without forcing a major adapter bump. Any new advisory fails CI.
- `astro check` is report-only because the committed tree carries pre-existing
  type errors; making it blocking would bury current CI signal behind old
  code. Flip it once those are fixed (the count lives in the workflow source).

## Deployment

Vercel, from `main`. The build produces static HTML plus the contact function;
`vercel.json` adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, a
`Permissions-Policy` that denies every sensor and capability the site does not
use, and a CSP that allows Cloudflare Turnstile and nothing else.

Set the environment variables above in the project settings before the first
deploy. Blog posts are Markdown in `src/content/blog`; publishing is a push,
and `npm run generate:og` should be run whenever a title changes so the social
card matches the page.

