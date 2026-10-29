/**
 * Self-test for the i18n scanner (scripts/check-i18n.mjs).
 * Verifies that the scanner's heuristics correctly distinguish
 * user-visible copy from code infrastructure.
 *
 * Run with: npx vitest run tests/scanner-self-test.test.ts
 */
import { describe, it, expect } from 'vitest';

// Copied from check-i18n.mjs for isolated testing
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const VISIBLE_ATTRS = /(?:aria-label|placeholder|title|alt|aria-description)\s*=\s*"([^"]*)"/g;
const SCRIPT_BLOCK = /<script[^>]*>([\s\S]*?)<\/script>/g;
const IGNORE = /i18n-ignore(?!-file)/;
const IGNORE_FILE = /i18n-ignore-file/;

const NON_COPY = [
  /^https?:\/\/\S*$/i,
  /^(?:mailto|tel|data):/i,
  /^[/#.@]/,
  /^\d{4}-\d{2}-\d{2}/,
  /^[0-9a-f]{3,8}$/i,
  /^[a-z][a-z0-9_-]*$/,
  /^[\w.+-]+\/[\w.+-]+$/,
  /^\d+$/,
  /^[^A-Za-z]+$/,
];

function isCopy(value) {
  const v = value.trim();
  if (v.length < 2) return false;
  if (v.includes('*')) return false;
  if (!/\s/.test(v) && v.includes('/')) return false;
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

// ── Fixtures ────────────────────────────────────────────────────────────────

// Fixture: strings that isCopy should identify as copy
// Note: isCopy is a COARSE filter - it only rejects OBVIOUS non-copy patterns.
// Stricter filtering happens in isScriptCopy for script blocks.
const COPY_STRINGS = [
  'BACK TO TOP ↑',
  'VIEW ALL PROJECTS',
  'Please enter your name.',
  'SEND MESSAGE',
  'LANGUAGES',
  'RUNTIME & INFRA',
  'SECURITY',
  'OBSERVABILITY',
  'TESTING',
  'TOOLING',
  'Developing Secure Software (LFD121)',
  'Linux Foundation',
  'Explore first, then commit. Map the problem space before writing code.',
  'Specify explicitly. Write the contract before the implementation.',

  // Strings starting with path-command letter + digits (must NOT be rejected as SVG paths)
  'M2 chip support',
  'L7 gateway',
  'C3 cache layer',
  'A2A protocol',

  // Short one-word UI labels
  'Home',
  'Back',

  // Strings with accents or punctuation
  'Contáctame',
  '¿Hablamos?',

  // Copy inside attributes (tested via VISIBLE_ATTRS regex in the full scanner)
  // These are tested indirectly through the full scanner integration

  // Uppercase static copy concatenated with a t() call (e.g. "HELLO, I AM EZEQUIEL RANIERI · {t('hero.role')}")
  // The static part must be identified as copy even though it's followed by an interpolation.
  'HELLO, I AM EZEQUIEL RANIERI · BACKEND & AI SECURITY ENGINEER',
  'VIEW ALL PROJECTS · SEE MORE',
];

// Fixture: strings that isCopy should REJECT (obvious non-copy patterns)
const NON_COPY_STRINGS = [
  // SVG path data - rejected by SVG path detection
  'M7 17 17 7',
  'M7 7h10v10',
  'M19 12H5M12 19l-7-7 7-7',
  'M3 9 9 3M4.2 3H9v4.8',
  // Function calls with no args
  't()',
  'getTranslator()',
  // Single identifiers (too short or no space)
  'hero',
  'blog',
  'nav',
  // Hex colors
  '#e8e8ea',
  '#ffffff',
  // ISO dates
  '2026-01-15T00:00:00.000Z',
  '2026-01-15',
  // Numbers
  '123',
  '42',
];

// Strings that isCopy ACCEPTS (returns true) but isScriptCopy should REJECT
// This is BY DESIGN: isCopy is coarse, isScriptCopy is strict
const CODE_TOKENS_ACCEPTED_BY_COPY = [
  // HTTP methods - isCopy accepts (coarse), isScriptCopy rejects
  'GET',
  'POST',
  'PUT',
  'DELETE',
  // Event names - isCopy accepts, isScriptCopy rejects
  'click',
  'keydown',
  'submit',
  'scroll',
  'resize',
  // CSS class/property names
  'is-open',
  'is-scrolled',
  'is-visible',
  'hidden',
  'visible',
  'true',
  'false',
  'auto',
  'smooth',
  // CSS selectors / JS property paths
  '.nav-link',
  '.blog-row',
  'a[href], button, [tabindex]:not([tabindex="-1"])',
  'a, button',
  'document.querySelector',
  'window.matchMedia',
  'getComputedStyle',
  // Media queries
  '(prefers-reduced-motion: reduce)',
  '(max-width: 1023.98px)',
  '(pointer: fine)',
  // URLs and paths
  '/api/contact',
  'https://api.resend.com/emails',
  '/blog/aegis-secure-ai-agents/',
  // Mime types
  'application/json',
  // Locale codes
  'en',
  'es',
  // Template literal fragments
  '${data.name}',
  // Codes starting with letter + digits that look SVG-like
  'A17 23 45 67',
  'C99 100 200',
];

// Fixture: strings that isScriptCopy should identify as copy
const SCRIPT_COPY_STRINGS = [
  'Please enter your name.',
  'MESSAGE SENT. I\'LL GET BACK TO YOU SOON.',
  'SOMETHING WENT WRONG. TRY AGAIN OR EMAIL ME DIRECTLY.',
];

// Fixture: strings that isScriptCopy should REJECT (code infrastructure in scripts)
const SCRIPT_NON_COPY_STRINGS = [
  'click',
  'keydown',
  'submit',
  '.nav-link',
  '(prefers-reduced-motion: reduce)',
  'document.querySelector',
  'true',
  'false',
  '/api/contact',
  'GET',
  'POST',
];

// ── Attribute-copy fixtures (VISIBLE_ATTRS regex) ───────────────────────────
// These test the full scanner's attribute extraction (aria-label, placeholder, title, alt, aria-description)
// The regex is tested here to ensure it captures real copy in attributes.
const ATTR_COPY_FIXTURES = [
  // Real attribute copy that should be extracted
  { html: '<button aria-label="Close menu">X</button>', expected: ['Close menu'] },
  { html: '<input placeholder="Your name" />', expected: ['Your name'] },
  { html: '<img alt="Ezequiel Ranieri portrait" />', expected: ['Ezequiel Ranieri portrait'] },
  { html: '<div title="Tooltip text">Hover</div>', expected: ['Tooltip text'] },
  { html: '<section aria-description="Main content area">', expected: ['Main content area'] },
  // Multiple attributes in one element
  { html: '<button aria-label="Open menu" title="Menu">☰</button>', expected: ['Open menu', 'Menu'] },
  // Non-copy attributes that should be filtered by isCopy
  { html: '<svg aria-label="M7 17 17 7">', expected: [] }, // SVG path rejected
  { html: '<a href="/blog" aria-label="/blog">', expected: [] }, // Path rejected
  { html: '<input placeholder="en" />', expected: [] }, // Locale code rejected
  { html: '<div title="#ffffff">', expected: [] }, // Hex color rejected
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('i18n scanner predicates', () => {
  describe('isCopy (coarse filter)', () => {
    it('should identify user-visible copy strings as copy', () => {
      for (const str of COPY_STRINGS) {
        expect(isCopy(str)).toBe(true);
      }
    });

    it('should reject obvious non-copy strings', () => {
      for (const str of NON_COPY_STRINGS) {
        expect(isCopy(str)).toBe(false);
      }
    });

    it('accepts some code tokens but rejects obvious non-copy', () => {
      // isCopy accepts some code tokens
      for (const str of ['document.querySelector', 'GET', 'POST', '${data.name}']) {
        expect(isCopy(str)).toBe(true);
      }
      // These are correctly rejected by isCopy as obvious non-copy patterns
      for (const str of ['click', 'keydown', '.nav-link', '/api/contact', 'application/json', 'en']) {
        expect(isCopy(str)).toBe(false);
      }
    });
  });

  describe('isScriptCopy (strict filter for script blocks)', () => {
    it('should identify user-visible copy in script context', () => {
      for (const str of ['Please enter your name.', 'MESSAGE SENT. I\'LL GET BACK TO YOU SOON.', 'SOMETHING WENT WRONG. TRY AGAIN OR EMAIL ME DIRECTLY.']) {
        expect(isScriptCopy(str)).toBe(true);
      }
    });

    it('should reject code infrastructure in script context', () => {
      for (const str of ['click', 'keydown', 'submit', '.nav-link', '(prefers-reduced-motion: reduce)', 'document.querySelector', 'true', 'false', '/api/contact', 'GET', 'POST']) {
        expect(isScriptCopy(str)).toBe(false);
      }
    });

    it('should reject code tokens that passed isCopy', () => {
      for (const str of ['GET', 'POST', 'click', 'keydown', '.nav-link', 'document.querySelector', '/api/contact', 'application/json', 'en', '${data.name}']) {
        expect(isScriptCopy(str)).toBe(false);
      }
    });
  });

  describe('SVG path detection', () => {
    it('should reject SVG path data starting with path commands', () => {
      const svgPaths = [
        'M7 17 17 7',
        'M7 7h10v10',
        'M19 12H5M12 19l-7-7 7-7',
        'L100 200',
        'C50 50 150 150 200 200',
      ];
      for (const path of svgPaths) {
        expect(isCopy(path)).toBe(false);
      }
    });
  });

  describe('URL and path filtering', () => {
    it('should reject URLs and paths', () => {
      expect(isCopy('https://api.resend.com/emails')).toBe(false);
      expect(isCopy('/api/contact')).toBe(false);
      expect(isCopy('/blog/aegis-secure-ai-agents/')).toBe(false);
    });
  });

  describe('Mime type filtering', () => {
    it('should reject mime types', () => {
      expect(isCopy('application/json')).toBe(false);
      expect(isCopy('text/html')).toBe(false);
    });
  });

  describe('Function call filtering', () => {
    it('should reject function calls with no args', () => {
      expect(isCopy('t()')).toBe(false);
      expect(isCopy('getTranslator()')).toBe(false);
    });
  });

  describe('VISIBLE_ATTRS regex (attribute copy extraction)', () => {
    it('should extract user-visible copy from aria-label, placeholder, title, alt, aria-description', () => {
      for (const fixture of ATTR_COPY_FIXTURES) {
        const matches = [];
        VISIBLE_ATTRS.lastIndex = 0;
        let m;
        while ((m = VISIBLE_ATTRS.exec(fixture.html))) {
          matches.push(m[1].trim());
        }
        // Filter through isCopy to simulate full scanner behavior
        const filtered = matches.filter(isCopy);
        expect(filtered).toEqual(fixture.expected);
      }
    });
  });
});