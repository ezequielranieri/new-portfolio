/**
 * Contact form email template.
 * Kept separate to avoid i18n checker flagging owner-facing template strings.
 *
 * Every user-controlled value is escaped before it reaches the HTML body, and
 * header-bound values (name, email, subject) are stripped of CR/LF so a payload
 * cannot inject extra mail headers. The text/plain body never contains markup.
 */

export interface ContactEmailData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export interface ContactEmail {
  subject: string;
  html: string;
  text: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape the five HTML-significant characters. Safe on non-string JSON values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Remove CR/LF (and collapse the resulting run of spaces) so a value cannot
 * terminate a header and start a new one (`\r\nBcc:`).
 */
export function sanitizeHeaderValue(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildContactEmail(data: ContactEmailData): ContactEmail {
  const name = sanitizeHeaderValue(data.name);
  const email = sanitizeHeaderValue(data.email);
  const phone = sanitizeHeaderValue(data.phone);
  const message = String(data.message ?? '');

  const subject = `New contact from ${name || 'unknown sender'}`;

  const html = `
    <h2>New Contact Form Submission</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  `;

  const text = `
    New Contact Form Submission
    Name: ${name}
    Email: ${email}
    Phone: ${phone || 'Not provided'}
    Message:
    ${message}
  `;

  return { subject, html, text };
}
