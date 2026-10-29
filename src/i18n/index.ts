import en from './en.json';
import es from './es.json';

export type Locale = 'en' | 'es';
export const defaultLocale: Locale = 'en';
export const locales: Locale[] = ['en', 'es'];

export const translations = { en, es } as const;

export function getTranslator(locale: Locale) {
  const dict = translations[locale] || translations[en];
  return function t(key: string, params?: Record<string, string | number>): string {
    const parts = key.split('.');
    let cur: any = dict;
    for (const p of parts) {
      cur = cur?.[p];
      if (cur === undefined) {
        let cen: any = translations[en];
        for (const pp of parts) {
          cen = cen?.[pp];
          if (cen === undefined) return key;
        }
        cur = cen;
        break;
      }
    }
    if (typeof cur !== 'string') return key;
    if (!params) return cur;
    let out = cur;
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
    return out;
  };
}
