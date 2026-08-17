/**
 * Single Source of Truth (SSOT) for locale configuration
 * All language-related configs derived from this metadata
 */

export type Locale = 'vi' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'es' | 'nl' | 'sv';

export interface LocaleMetadata {
  nativeName: string;
  flag: string;
  intlCode: string;
}

export const LOCALE_METADATA: Record<Locale, LocaleMetadata> = {
  vi: {
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    intlCode: 'vi-VN',
  },
  en: {
    nativeName: 'English',
    flag: '🇺🇸',
    intlCode: 'en-US',
  },
  pt: {
    nativeName: 'Português',
    flag: '🇵🇹',
    intlCode: 'pt-PT',
  },
  fr: {
    nativeName: 'Français',
    flag: '🇫🇷',
    intlCode: 'fr-FR',
  },
  de: {
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    intlCode: 'de-DE',
  },
  it: {
    nativeName: 'Italiano',
    flag: '🇮🇹',
    intlCode: 'it-IT',
  },
  es: {
    nativeName: 'Español',
    flag: '🇪🇸',
    intlCode: 'es-ES',
  },
  nl: {
    nativeName: 'Nederlands',
    flag: '🇳🇱',
    intlCode: 'nl-NL',
  },
  sv: {
    nativeName: 'Svenska',
    flag: '🇸🇪',
    intlCode: 'sv-SE',
  },
};

// Derive all configs from base metadata
export const SUPPORTED_LOCALES: Locale[] = Object.keys(LOCALE_METADATA) as Locale[];

export const AVAILABLE_LOCALES: Record<Locale, { flag: string; labelKey: string }> = Object.fromEntries(
  Object.entries(LOCALE_METADATA).map(([lang, meta]) => [
    lang,
    { flag: meta.flag, labelKey: `locale_label_${lang}` },
  ])
) as Record<Locale, { flag: string; labelKey: string }>;

export const INTL_LOCALES: Record<Locale, string> = Object.fromEntries(
  Object.entries(LOCALE_METADATA).map(([lang, meta]) => [lang, meta.intlCode])
) as Record<Locale, string>;
