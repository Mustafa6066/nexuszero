export { default as en } from './en';
export { default as ar } from './ar';
export type { Translations } from './en';

export type Locale = 'en' | 'ar';
export const RTL_LOCALES: Locale[] = ['ar'];
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ar: 'العربية' };
