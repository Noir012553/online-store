import { Locale, SUPPORTED_LOCALES, INTL_LOCALES } from './i18n/types';

export function getIntlLocale(locale: Locale): string {
  const intlLocale = INTL_LOCALES[locale];
  if (!intlLocale) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  return intlLocale;
}

export function isValidLocale(locale: any): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale);
}
