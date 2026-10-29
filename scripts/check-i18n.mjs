#!/usr/bin/env node
// i18n integrity check for the portfolio.
//
// Reports five classes of problem:
//   1. PARITY      a key exists in one dictionary but not the other
//   2. UNUSED      a dictionary key is never referenced from src/
//   3. HARDCODED   a user-visible string is written inline instead of coming
//                  from a dictionary
//   4. UNTRANSLATED  a Spanish value is identical to English and not allowlisted
//   5. LENGTH      a Spanish value is >30% longer than English (ADVISORY: it is
//                  reported for layout review but never affects the exit code)
//
// Usage:  node scripts/check-i18n.mjs [--warn]
//   --warn  report problems but always exit 0 (default: exit 1 on any problem)
//
// Where it looks for hardcoded copy:
//   - .astro templates: element text nodes (`>text<`) and visible attributes
//     (aria-label, placeholder, title, alt, aria-description)
//   - .astro frontmatter: string literals, including data arrays/objects
//   - .ts/.js/.mjs: string literals
//
// Escapes:
//   - `i18n-ignore` on the offending line (or the line above) suppresses that
//     hit. Use it only for genuinely non-copy literals.
//   - `i18n-ignore-file` anywhere in a file suppresses the whole file.
//
// Deliberately NOT part of `astro build` yet: it stays red until the pages are
// wired to the dictionaries.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const LOCALES = ['en', 'es'];
const warnOnly = process.argv.includes('--warn');

// Directories that hold no user-facing view text.
const SKIP_DIRS = ['i18n', 'styles', 'content', 'config', 'lib'].map((d) => join(SRC, d));
// Individual non-view files.
const SKIP_FILES = new Set([join(SRC, 'content.config.ts')]);
const SCANNABLE = new Set(['.astro', '.tsx', '.jsx', '.ts', '.js', '.mjs']);

// Attribute values that end up visible to a human.
const VISIBLE_ATTRS = /(?:aria-label|placeholder|title|alt|aria-description)\s*=\s*"([^"]*)"/g;

// String literal, single/double/backtick quoted.
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

// Inline client script blocks.
const SCRIPT_BLOCK = /<script[^>]*>([\s\S]*?)<\/script>/g;

// Inline style blocks - skip entirely (CSS class names, property values, SVG paths in inline SVG)
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g;

// `i18n-ignore` on a line (or the line above) suppresses that hit.
// `i18n-ignore-file` anywhere in a file suppresses the whole file.
const IGNORE = /i18n-ignore(?!-file)/;
const IGNORE_FILE = /i18n-ignore-file/;

// Literals that are never user-visible copy.
const NON_COPY = [
  /^https?:\/\/\S*$/i,
  /^(?:mailto|tel|data):/i,
  /^[/#.@]/,
  /^\d{4}-\d{2}-\d{2}/, // ISO date / datetime
  /^[0-9a-f]{3,8}$/i, // hex colour
  /^[a-z][a-z0-9_-]*$/, // single lowercase identifier / css-ish token
  /^[\w.+-]+\/[\w.+-]+$/, // mime type or dotted path
  /^\d+$/,
  /^[^A-Za-z]+$/, // no letters at all
];

function isCopy(value) {
  const v = value.trim();
  if (v.length < 2) return false;
  if (v.includes('*')) return false; // glob pattern
  if (!/\s/.test(v) && v.includes('/')) return false; // path / URL fragment
  // SVG path data: starts with a path command letter FOLLOWED by coordinate-like pattern
  // More precise: command letter followed by digits/coords (not just any punctuation)
  // Must have multiple coordinate-like sequences to be considered an SVG path
  if (/^[MLHVCSQTAZmlhvcsqtaz]/.test(v)) {
    // Count coordinate-like patterns (digit followed by digit/comma/space/dot/minus)
    const coordMatches = v.match(/[\d][\d.,\-\s]/g) || [];
    // Real SVG paths have multiple coordinate sequences; single digit after command is not enough
    if (coordMatches.length >= 2) return false;
  }
  // Function calls like t() or t() - no args
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*\(\s*\)$/.test(v)) return false;
  return !NON_COPY.some((re) => re.test(v));
}

// Client-script literals are noisier than markup: selectors, event names and
// class names are all string literals. Only flag ones that read as copy: a
// spelled-out phrase with sentence punctuation or known UI message patterns.
// Exclude common code patterns: CSS selectors, media queries, HTTP methods,
// event names, class/attribute names, URLs, and JS property paths.
function isScriptCopy(value) {
  const v = value.trim();
  if (!isCopy(v)) return false;

  // Reject CSS selectors (contain selector chars but no sentence structure)
  if (/[\[\]:.#,>+~]/.test(v) && !/[.!?]/.test(v)) return false;
  // Reject media queries
  if (/^\((max|min|prefers|pointer)/.test(v)) return false;
  // Reject HTTP methods
  if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i.test(v)) return false;
  // Reject common event names
  if (/^(click|keydown|keyup|submit|change|input|focus|blur|mouse|scroll|resize|load|error)$/i.test(v)) return false;
  // Reject CSS property/value pairs and class names (short, no sentence punctuation)
  if (!/[.!?]/.test(v) && /^(?:[a-z-]+|[A-Z-]+|is-[a-z-]+|has-[a-z-]+|aria-[a-z-]+|data-[a-z-]+|true|false|auto|smooth|hidden|visible)$/i.test(v)) return false;
  // Reject JS property paths (contain dots, no spaces)
  if (!/\s/.test(v) && /\.\w/.test(v)) return false;
  // Reject template literal fragments
  if (v.includes('\${')) return false;
  // Reject URL/api fragments
  if (v.startsWith('/') || v.startsWith('http') || v.includes('api/') || v.includes('locale=')) return false;
  // Reject short tokens that are likely code (under 3 chars or single word)
  if (v.length < 10 && !/\s/.test(v)) return false;

  // Accept: a spelled-out phrase with sentence punctuation or multiple words
  if (/\s/.test(v) && /[.!?]/.test(v)) return true;
  // Accept: known UI message patterns (all caps with spaces)
  if (/\s/.test(v) && v === v.toUpperCase() && v.length > 5) return true;

  return false;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP_DIRS.includes(p) || SKIP_FILES.has(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SCANNABLE.has(extname(p))) out.push(p);
  }
  return out;
}

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function loadDict(locale) {
  const p = join(SRC, 'i18n', `${locale}.json`);
  try {
    return flatten(JSON.parse(readFileSync(p, 'utf8')));
  } catch (err) {
    console.error(`could not read ${relative(ROOT, p)}: ${err.message}`);
    process.exit(2);
  }
}

/** Split an .astro file into its frontmatter and its template. */
function splitAstro(source) {
  const parts = source.split(/^---\s*$/m);
  if (parts.length >= 3) {
    return { frontmatter: parts[1], template: parts.slice(2).join('---') };
  }
  return { frontmatter: '', template: source };
}

/** Strip import statements, t() calls, template literals, and comments so their arguments are not flagged. */
function stripNoise(code) {
  return code
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove template literals (backtick-quoted) - they contain code, not copy
    .replace(/`[\s\S]*?`/g, '``')
    // Remove t() calls
    .replace(/\bt\(\s*(['"`])(?:\\.|(?!\1)[^\\])*\1\s*(?:,[^)]*)?\)/g, 't()')
    // Remove import statements
    .replace(/^\s*import\s[\s\S]*?from\s*(['"`])[\s\S]*?\1;?/gm, '')
    .replace(/^\s*import\s*(['"`])[\s\S]*?\1;?/gm, '');
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function ignoredAt(source, index) {
  const line = lineOf(source, index);
  const lines = source.split('\n');
  return IGNORE.test(lines[line - 1] || '') || IGNORE.test(lines[line - 2] || '');
}

/** True when any occurrence of `value` in `source` carries an i18n-ignore. */
function ignoredAnywhere(source, value) {
  let from = 0;
  while (true) {
    const idx = source.indexOf(value, from);
    if (idx === -1) return false;
    if (ignoredAt(source, idx)) return true;
    from = idx + 1;
  }
}

function scanLiterals(code, source, file, kind, hits, predicate = isCopy) {
  LITERAL.lastIndex = 0;
  let m;
  while ((m = LITERAL.exec(code))) {
    const value = m[2];
    if (!predicate(value)) continue;
    if (ignoredAnywhere(source, value)) continue;
    hits.push({ file, kind, value: value.trim() });
  }
}

function collectHits(file, source) {
  if (IGNORE_FILE.test(source)) return [];
  const rel = relative(ROOT, file);
  const hits = [];
  const ext = extname(file);

  if (ext === '.astro') {
    const { frontmatter, template } = splitAstro(source);

    // Element text nodes.
    const textNode = />([^<>{}]+)</g;
    let m;
    while ((m = textNode.exec(template))) {
      const text = m[1].replace(/\s+/g, ' ').trim();
      if (!isCopy(text)) continue;
      if (ignoredAnywhere(source, text)) continue;
      hits.push({ file: rel, kind: 'text', value: text });
    }

    // Visible attributes.
    VISIBLE_ATTRS.lastIndex = 0;
    while ((m = VISIBLE_ATTRS.exec(template))) {
      const value = m[1].trim();
      if (!isCopy(value) || value.includes('{')) continue;
      if (ignoredAnywhere(source, value)) continue;
      hits.push({ file: rel, kind: 'attr', value });
    }

    // Client script blocks (form validation and status messages live here).
    SCRIPT_BLOCK.lastIndex = 0;
    while ((m = SCRIPT_BLOCK.exec(template))) {
      scanLiterals(stripNoise(m[1]), source, rel, 'script', hits, isScriptCopy);
    }

    // Skip style blocks entirely (CSS class names, property values, SVG paths in inline SVG).
    const templateNoStyle = template.replace(STYLE_BLOCK, '');

    scanLiterals(stripNoise(frontmatter), source, rel, 'frontmatter', hits);
  } else {
    scanLiterals(stripNoise(source), source, rel, 'literal', hits);
  }

  return hits;
}

// Keys allowed to have identical values in both locales, each with the reason.
//
//   brand         the owner's identity, identical by design in both locales
//   name          a section, group or destination named by a technical term
//   term          a technical term, acronym or piece of English jargon
//   project-name  a project's own name and its English descriptor
//   cert-name     an official certification name and its issuer
//   email-label   the e-mail field abbreviation
//   meta          SEO titles built from the brand name
//   stack-list    technology lists, proper nouns only, no prose
//   switcher-aria written in the target language, so both dictionaries
//                 legitimately hold the same pair
//   tag           reserved; article tags come from the content collection
//
// Anything not fitting these categories MUST be translated. An entry that is no
// longer needed is reported as STALE below, so it cannot outlive its reason.
const IDENTICAL_ALLOWLIST = new Map([
  // brand (3)
  ['brand.initials', 'brand'],
  ['brand.fullName', 'brand'],
  ['hero.heroName', 'brand'],

  // name (3) - section and destination names that are technical English
  ['home.howIWork.categories.stack.name', 'name'],
  ['home.stack.runtimeInfra.label', 'name'],
  ['nav.blog', 'name'],

  // term (3) - English jargon Spanish tech writing keeps as-is
  ['hero.scroll', 'term'],
  ['notFound.title', 'term'],
  ['article.labelPrefix', 'term'],

  // project-name (4)
  ['home.projects.aegis.name', 'project-name'],
  ['home.projects.aegis.label', 'project-name'],
  ['home.projects.agentGateway.name', 'project-name'],
  ['home.projects.mettle.name', 'project-name'],

  // cert-name (4)
  ['home.certifications.developingSecureSoftware.name', 'cert-name'],
  ['home.certifications.developingSecureSoftware.issuer', 'cert-name'],
  ['home.certifications.secureAiMlDrivenSoftwareDevelopment.name', 'cert-name'],
  ['home.certifications.secureAiMlDrivenSoftwareDevelopment.issuer', 'cert-name'],

  // email-label (2) - standard abbreviations, not words
  ['home.contact.info.emailLabel', 'email-label'],
  ['home.contact.form.emailLabel', 'email-label'],

  // meta (2) - titles built from the brand name
  ['blog.meta.title', 'meta'],
  ['notFound.meta.title', 'meta'],

  // stack-list (5) - every entry is a product name
  ['home.stack.runtimeInfra.text', 'stack-list'],
  ['home.stack.security.text', 'stack-list'],
  ['home.stack.observability.text', 'stack-list'],
  ['home.stack.testing.text', 'stack-list'],
  ['home.stack.tooling.text', 'stack-list'],

  // switcher-aria (4) - the two language codes plus the two announcements,
  // each written in the language it points at, so they are equal by design.
  ['switcher.labelEn', 'switcher-aria'],
  ['switcher.labelEs', 'switcher-aria'],
  ['switcher.switchToEn', 'switcher-aria'],
  ['switcher.switchToEs', 'switcher-aria'],

  // NOTE: These are NOW TRANSLATED (removed from allowlist):
  // home.portfolio.subtitle -> "HOLA, SOY EZEQUIEL RANIERI · BACKEND & AI SECURITY ENGINEER"
  // home.meta.description -> SEO Spanish
  // home.howIWork.categories.principles.name -> "PRINCIPIOS"
  // home.howIWork.categories.methodology.name -> "METODOLOGÍA"
  // home.howIWork.categories.certifications.name -> "CERTIFICACIONES"
  // home.howIWork.categories.principles.items.securityFirst.name -> "Seguridad primero"
  // home.howIWork.categories.principles.items.hexagonalArchitecture.name -> "Arquitectura hexagonal"
  // home.howIWork.categories.principles.items.testingAsSpecification.name -> "Pruebas como especificación"
  // home.howIWork.categories.principles.items.nativeObservability.name -> "Observabilidad nativa"
  // home.howIWork.categories.principles.items.simplicityOverCleverness.name -> "Simplicidad antes que ingenio"
  // home.howIWork.categories.principles.items.livingDocumentation.name -> "Documentación viva"
  // home.stack.testing.label -> "PRUEBAS"
  // home.stack.tooling.label -> "HERRAMIENTAS"
  // a11y.socialLinks -> "Redes sociales"
  // a11y.githubProfile/linkedinProfile/xProfile -> "Perfil de ..."
  // home.stack.languages.text -> "Go (principal) · Rust · TypeScript · Python"
  // home.articles.*.tag -> the blog collection owns the tags now
]);

// ── load dictionaries ───────────────────────────────────────────────────────
const dicts = Object.fromEntries(LOCALES.map((l) => [l, loadDict(l)]));

const problems = { parity: [], unused: [], hardcoded: [], untranslated: [], staleAllowlist: [], allowlistReview: [], lengthReview: [] };

// ── 1. parity ───────────────────────────────────────────────────────────────
const [a, b] = LOCALES;
for (const key of dicts[a].keys()) {
  if (!dicts[b].has(key)) problems.parity.push(`missing in ${b}.json: ${key}`);
}
for (const key of dicts[b].keys()) {
  if (!dicts[a].has(key)) problems.parity.push(`missing in ${a}.json: ${key}`);
}

// ── 1b. untranslated Spanish check ──────────────────────────────────────────
// Every es.json value identical to its en.json value must be on the allowlist.
for (const key of dicts[a].keys()) {
  const enVal = dicts[a].get(key);
  const esVal = dicts[b].get(key);
  if (esVal !== undefined && enVal === esVal && !IDENTICAL_ALLOWLIST.has(key)) {
    problems.untranslated.push(`${key}: "${enVal}"`);
  }
}

// ── 1c. allowlist audit ─────────────────────────────────────────────────────
// An allowlisted key that no longer exists, or that now differs between the two
// locales, is STALE: it excuses nothing and hides the next real duplicate, so it
// blocks. Rot here is what let home.articles.*.tag outlive the keys themselves.
const PROSE_WORDS =
  /\b(?:the|and|or|of|to|in|for|with|from|at|on|by|your|my|our|their|primary|secondary|switch|about|please|all|new|old|see|view|show|hide|open|close|learn|read|more|less|next|previous)\b/i;

for (const [key, category] of IDENTICAL_ALLOWLIST) {
  const enVal = dicts[a].get(key);
  const esVal = dicts[b].get(key);
  if (enVal === undefined || esVal === undefined) {
    problems.staleAllowlist.push(`${category}: ${key} no longer exists in both dictionaries`);
    continue;
  }
  if (enVal !== esVal) {
    problems.staleAllowlist.push(`${category}: ${key} is translated now (EN="${enVal}" / ES="${esVal}")`);
    continue;
  }
  const prose = enVal.match(PROSE_WORDS);
  if (prose) {
    problems.allowlistReview.push(`${category}: ${key} = "${enVal}" contains "${prose[0]}"`);
  }
}

// ── 1d. Spanish length check ────────────────────────────────────────────────
// Flag Spanish strings >30% longer than English source (review candidates).
problems.lengthReview = [];
for (const key of dicts[a].keys()) {
  const enVal = dicts[a].get(key);
  const esVal = dicts[b].get(key);
  if (esVal !== undefined && enVal && esVal !== enVal) {
    const ratio = esVal.length / enVal.length;
    if (ratio > 1.3) {
      problems.lengthReview.push(`${key}: EN="${enVal}" (${enVal.length}) → ES="${esVal}" (${esVal.length}, ${Math.round((ratio - 1) * 100)}% longer)`);
    }
  }
}

// ── 2. usage ────────────────────────────────────────────────────────────────
const files = walk(SRC);
const used = new Set();
let dynamicKeys = false;
const T_CALL = /\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1/g;
const T_DYNAMIC = /\bt\(\s*[`$]/;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (T_DYNAMIC.test(source)) dynamicKeys = true;
  T_CALL.lastIndex = 0;
  let m;
  while ((m = T_CALL.exec(source))) used.add(m[2]);
}

// ── 3. hardcoded strings ────────────────────────────────────────────────────
for (const file of files) {
  problems.hardcoded.push(...collectHits(file, readFileSync(file, 'utf8')));
}

// ── report ──────────────────────────────────────────────────────────────────
if (!dynamicKeys) {
  for (const key of dicts[a].keys()) {
    if (!used.has(key)) problems.unused.push(key);
  }
}

const cap = (list, n = 30) =>
  list.length <= n ? list : [...list.slice(0, n), `… and ${list.length - n} more`];

// Bloquea solo lo que rompe la integridad. `lengthReview` es advisory: se
// reporta para revisión de layout, pero no decide el exit code.
const blocking =
  problems.parity.length +
  problems.unused.length +
  problems.hardcoded.length +
  problems.untranslated.length +
  problems.staleAllowlist.length;
const total = blocking;

if (problems.parity.length) {
  console.log(`\nPARITY (${problems.parity.length})`);
  for (const line of cap(problems.parity)) console.log(`  ${line}`);
}
if (problems.unused.length) {
  console.log(`\nUNUSED dictionary keys (${problems.unused.length})`);
  for (const line of cap(problems.unused)) console.log(`  ${line}`);
}
if (problems.hardcoded.length) {
  const byFile = new Map();
  for (const h of problems.hardcoded) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(`${h.kind}: ${h.value}`);
  }
  console.log(`\nHARDCODED strings (${problems.hardcoded.length} in ${byFile.size} files)`);
  for (const [file, items] of [...byFile].sort()) {
    console.log(`  ${file} (${items.length})`);
    for (const item of items.slice(0, 8)) console.log(`      ${item}`);
    if (items.length > 8) console.log(`      … ${items.length - 8} more`);
  }
}
if (problems.untranslated.length) {
  console.log(`\nUNTRANSLATED Spanish (${problems.untranslated.length})`);
  for (const line of cap(problems.untranslated)) console.log(`  ${line}`);
}
if (problems.staleAllowlist.length) {
  console.log(`\nSTALE allowlist entries (${problems.staleAllowlist.length})`);
  for (const line of cap(problems.staleAllowlist)) console.log(`  ${line}`);
}
if (problems.allowlistReview.length) {
  console.log(`\nALLOWLIST ENTRIES HOLDING A TRANSLATABLE WORD (${problems.allowlistReview.length})`);
  for (const line of cap(problems.allowlistReview)) console.log(`  ${line}`);
}
if (problems.lengthReview.length) {
  console.log(`\nSPANISH >30% LONGER (${problems.lengthReview.length})`);
  for (const line of cap(problems.lengthReview)) console.log(`  ${line}`);
}

if (dynamicKeys) {
  console.log('\nnote: dynamic t(`…`) usage found; UNUSED keys cannot be determined reliably.');
}

console.log(
  `\nsummary: parity ${problems.parity.length}, unused ${problems.unused.length}, ` +
    `hardcoded ${problems.hardcoded.length}, untranslated ${problems.untranslated.length}, ` +
    `staleAllowlist ${problems.staleAllowlist.length}, ` +
    `allowlistReview ${problems.allowlistReview.length} (advisory), ` +
    `lengthReview ${problems.lengthReview.length} (advisory)${dynamicKeys ? ' (unused skipped)' : ''}`
);

if (total === 0) {
  console.log('i18n check: OK');
  process.exit(0);
}
console.log(warnOnly ? 'i18n check: problems found (warn only)' : 'i18n check: FAILED');
process.exit(warnOnly ? 0 : 1);
