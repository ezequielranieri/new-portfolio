import { describe, it, expect } from 'vitest';
import { buildContactEmail, escapeHtml, sanitizeHeaderValue } from '../src/lib/contact-email';

const base = { name: 'Ada', email: 'ada@example.com', phone: '+54 11 5555', message: 'Hello there, long enough.' };

describe('escapeHtml', () => {
  it('escapes a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes attribute-breaking quotes', () => {
    expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
  });

  it('escapes single quotes, ampersands and angle brackets', () => {
    expect(escapeHtml(`<img src=x onerror='1'> & co`)).toBe(
      '&lt;img src=x onerror=&#39;1&#39;&gt; &amp; co'
    );
  });

  it('does not double-escape an already plain value', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });

  it('tolerates non-string values', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('sanitizeHeaderValue', () => {
  it('removes CRLF sequences', () => {
    expect(sanitizeHeaderValue('Eve\r\nBcc: victim@example.com')).toBe('Eve Bcc: victim@example.com');
  });

  it('removes lone CR, LF and tabs', () => {
    expect(sanitizeHeaderValue('a\rb\nc\td')).toBe('a b c d');
  });

  it('collapses the spaces left behind', () => {
    expect(sanitizeHeaderValue('a\r\n\r\n\r\nb')).toBe('a b');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeHeaderValue('  Ada  ')).toBe('Ada');
  });

  it('keeps an ordinary single-line name intact', () => {
    expect(sanitizeHeaderValue('Ada Lovelace')).toBe('Ada Lovelace');
  });
});

describe('buildContactEmail — HTML escaping', () => {
  it('never emits a live script tag from the name', () => {
    const { html } = buildContactEmail({ ...base, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('never emits live markup from the email field', () => {
    const { html } = buildContactEmail({ ...base, email: '"><img src=x onerror=alert(1)>@example.com' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('never emits live markup from the phone field', () => {
    const { html } = buildContactEmail({ ...base, phone: '<iframe src="javascript:alert(1)">' });
    expect(html).not.toContain('<iframe');
    expect(html).toContain('&lt;iframe');
  });

  it('never emits live markup from the message field', () => {
    const { html } = buildContactEmail({ ...base, message: '<svg onload=alert(1)> and more text' });
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;svg onload=alert(1)&gt; and more text');
  });

  it('keeps message line breaks as <br> after escaping', () => {
    const { html } = buildContactEmail({ ...base, message: 'line one\nline two\nline <three>' });
    expect(html).toContain('line one<br>line two<br>line &lt;three&gt;');
  });

  it('falls back to "Not provided" when the phone is empty', () => {
    const { html } = buildContactEmail({ ...base, phone: '' });
    expect(html).toContain('Not provided');
  });
});

describe('buildContactEmail — header injection', () => {
  it('strips CRLF from the subject built from the name', () => {
    const { subject } = buildContactEmail({ ...base, name: 'Eve\r\nBcc: victim@example.com' });
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toBe('New contact from Eve Bcc: victim@example.com');
  });

  it('strips CRLF from every header-bound field at once', () => {
    const { subject, html, text } = buildContactEmail({
      ...base,
      name: 'A\r\nBcc: one@example.com',
      email: 'b\r\nCc: two@example.com',
      phone: 'c\r\nX-Header: injected',
    });
    expect(subject).not.toMatch(/[\r\n]/);
    for (const line of [html, text]) {
      expect(line).not.toMatch(/\r\n(?:Bcc|Cc|X-Header):/);
    }
  });

  it('uses a safe subject when the name is only whitespace', () => {
    const { subject } = buildContactEmail({ ...base, name: '   ' });
    expect(subject).toBe('New contact from unknown sender');
  });
});

describe('buildContactEmail — text/plain body', () => {
  it('is always provided', () => {
    const { text } = buildContactEmail(base);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('carries no markup emitted by the template', () => {
    const { text } = buildContactEmail({ ...base, name: '<b>Ada</b>', message: '<p>hello</p>' });
    // Plain text must never gain template-generated markup...
    expect(text).not.toContain('<strong>');
    expect(text).not.toContain('&lt;');
    // ...while the user's literal characters stay verbatim: escaping is an
    // HTML concern only, and mangling plain text would corrupt the data.
    expect(text).toContain('<b>Ada</b>');
    expect(text).toContain('<p>hello</p>');
  });

  it('contains no <br> substitutes', () => {
    const { text } = buildContactEmail({ ...base, message: 'line one\nline two' });
    expect(text).not.toContain('<br>');
    expect(text).toContain('line one\nline two');
  });

  it('carries all four user fields', () => {
    const { text } = buildContactEmail(base);
    expect(text).toContain('Ada');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('+54 11 5555');
    expect(text).toContain('Hello there, long enough.');
  });
});
