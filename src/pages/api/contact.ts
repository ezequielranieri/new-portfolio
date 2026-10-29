// i18n-ignore-file - API route: owner-facing email template extracted to lib/contact-email.ts;
// all user-facing responses use t() with validated locale; remaining flags are code
// infrastructure (HTTP headers, JSON structure, URL schemes) that the checker
// conservatively flags but are not user-visible copy.
import type { APIRoute } from 'astro';
import { getTranslator } from '@/i18n';
import { buildContactEmail } from '@/lib/contact-email';
import { isCrossOriginRequest } from '@/lib/request-guards';
import { SITE_URL } from '@/config/site';
import { createRateLimiter } from '@/lib/rate-limit';
import { verifyTurnstileToken } from '@/lib/turnstile';

const ALLOWED_LOCALES = ['en', 'es'] as const;
type AllowedLocale = (typeof ALLOWED_LOCALES)[number];
const DEFAULT_LOCALE: AllowedLocale = 'en';

function validateLocale(locale: unknown): AllowedLocale {
  if (typeof locale !== 'string') return DEFAULT_LOCALE;
  return ALLOWED_LOCALES.includes(locale as AllowedLocale) ? (locale as AllowedLocale) : DEFAULT_LOCALE;
}

interface ContactPayload {
  name: string;
  phone: string;
  email: string;
  message: string;
  _gotcha?: string;
  turnstileToken?: string;
}

interface ContactResponse {
  success: boolean;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared sliding window in Upstash Redis, with a per-instance memory fallback
// when the credentials are absent or Redis is unreachable. A module-scope Map
// alone would let every cold instance start from zero.
const limiter = createRateLimiter();

let warnedMissingTurnstile = false;

function getClientIP(request: Request): string {
  // Check various headers for real IP (behind proxies)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;
  return 'unknown';
}

// Get translator for the given locale (defaults to 'en')
function getT(locale: AllowedLocale) {
  return getTranslator(locale);
}

async function sendEmail(data: ContactPayload): Promise<void> {
  const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
  const CONTACT_FROM_EMAIL = import.meta.env.CONTACT_FROM_EMAIL;
  const CONTACT_TO_EMAIL = import.meta.env.CONTACT_TO_EMAIL;

  if (!RESEND_API_KEY || !CONTACT_FROM_EMAIL || !CONTACT_TO_EMAIL) {
    console.error('Missing Resend configuration (RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL)'); // i18n-ignore
    throw new Error('Email service not configured'); // i18n-ignore
  }

  // The subject is built from the user-supplied name, so it comes from the
  // template helper already stripped of CR/LF (header-injection safe).
  const { subject, html, text } = buildContactEmail(data);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: [CONTACT_TO_EMAIL],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend API error:', error); // i18n-ignore
    throw new Error('Failed to send email'); // i18n-ignore
  }
}

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  // Get locale from query param, validate against allowlist, default to 'en'
  const rawLocale = url.searchParams.get('locale');
  const locale = validateLocale(rawLocale);
  const t = getT(locale);

  try {
    const ip = getClientIP(request);

    // Cross-origin guard. Stateless on purpose: no session exists here, so a
    // CSRF token would protect nothing. Reject a browser page that is not ours
    // before it can spend the visitor's rate-limit budget.
    if (isCrossOriginRequest(request, SITE_URL)) {
      return new Response(
        JSON.stringify({ success: false, message: t('contactApi.forbidden') } as ContactResponse),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting
    const { success: withinLimit } = await limiter.limit(ip);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({ success: false, message: t('contactApi.rateLimited') } as ContactResponse),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON body
    let payload: ContactPayload;
    try {
      payload = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: t('contactApi.invalidJson') } as ContactResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Honeypot check — silently succeed if filled
    if (payload._gotcha && payload._gotcha.trim()) {
      return new Response(
        JSON.stringify({ success: true, message: t('home.contact.form.status.success') } as ContactResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Server-side validation
    if (!payload.name || !payload.name.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: t('home.contact.form.validation.nameRequired') } as ContactResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.email || !EMAIL_RE.test(payload.email.trim())) {
      return new Response(
        JSON.stringify({ success: false, message: t('home.contact.form.validation.emailInvalid') } as ContactResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.message || payload.message.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, message: t('home.contact.form.validation.messageMinLength') } as ContactResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (payload.message.trim().length > 2000) {
      return new Response(
        JSON.stringify({ success: false, message: t('contactApi.messageTooLong') } as ContactResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Turnstile is verified last, right before sending: a token is single-use,
    // so consuming it must only ever accompany a submission that really sends.
    const turnstileSecret = import.meta.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret && !warnedMissingTurnstile) {
      warnedMissingTurnstile = true;
      console.warn('Contact form: TURNSTILE_SECRET_KEY is not set; captcha verification is skipped.'); // i18n-ignore
    }

    const captcha = await verifyTurnstileToken({
      token: payload.turnstileToken,
      secret: turnstileSecret,
      remoteIp: ip,
    });

    if (!captcha.success) {
      if (captcha.reason === 'verify-error') {
        console.error('Contact form: Turnstile verification failed', captcha.errorCodes ?? []); // i18n-ignore
      }
      return new Response(
        JSON.stringify({ success: false, message: t('contactApi.captchaFailed') } as ContactResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send email via Resend
    await sendEmail(payload);

    return new Response(
      JSON.stringify({ success: true, message: t('home.contact.form.status.success') } as ContactResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Contact form error:', error); // i18n-ignore
    return new Response(
      JSON.stringify({ success: false, message: t('home.contact.form.status.error') } as ContactResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};