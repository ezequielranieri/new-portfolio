import { describe, it, expect } from 'vitest';

const ALLOWED_LOCALES = ['en', 'es'] as const;
type AllowedLocale = (typeof ALLOWED_LOCALES)[number];
const DEFAULT_LOCALE: AllowedLocale = 'en';

function validateLocale(locale: unknown): AllowedLocale {
  if (typeof locale !== 'string') return DEFAULT_LOCALE;
  return ALLOWED_LOCALES.includes(locale as AllowedLocale) ? (locale as AllowedLocale) : DEFAULT_LOCALE;
}

describe('validateLocale', () => {
  it('returns default for valid "en"', () => {
    expect(validateLocale('en')).toBe('en');
  });

  it('returns default for valid "es"', () => {
    expect(validateLocale('es')).toBe('es');
  });

  it('returns default for invalid locale "xx"', () => {
    expect(validateLocale('xx')).toBe(DEFAULT_LOCALE);
  });

  it('returns default for empty string', () => {
    expect(validateLocale('')).toBe(DEFAULT_LOCALE);
  });

  it('returns default for null', () => {
    expect(validateLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('returns default for undefined', () => {
    expect(validateLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('returns default for object', () => {
    expect(validateLocale({})).toBe(DEFAULT_LOCALE);
  });

  it('returns default for very long string', () => {
    expect(validateLocale('a'.repeat(1000))).toBe(DEFAULT_LOCALE);
  });

  it('returns default for number', () => {
    expect(validateLocale(123)).toBe(DEFAULT_LOCALE);
  });

  it('ALLOWED_LOCALES contains only en and es', () => {
    expect(ALLOWED_LOCALES).toEqual(['en', 'es']);
  });

  it('DEFAULT_LOCALE is en', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});