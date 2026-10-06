/**
 * Single Source of Truth (SSOT) for locale configuration
 * All language-related configs derived from this metadata
 */

export type Locale = 'vi' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'es' | 'nl' | 'sv';

export interface LocaleMetadata {
  nativeName: string;
  intlCode: string;
}

export const LOCALE_METADATA: Record<Locale, LocaleMetadata> = {
  vi: {
    nativeName: 'Tiếng Việt',
    intlCode: 'vi-VN',
  },
  en: {
    nativeName: 'English',
    intlCode: 'en-US',
  },
  pt: {
    nativeName: 'Português',
    intlCode: 'pt-PT',
  },
  fr: {
    nativeName: 'Français',
    intlCode: 'fr-FR',
  },
  de: {
    nativeName: 'Deutsch',
    intlCode: 'de-DE',
  },
  it: {
    nativeName: 'Italiano',
    intlCode: 'it-IT',
  },
  es: {
    nativeName: 'Español',
    intlCode: 'es-ES',
  },
  nl: {
    nativeName: 'Nederlands',
    intlCode: 'nl-NL',
  },
  sv: {
    nativeName: 'Svenska',
    intlCode: 'sv-SE',
  },
};

// Derive all configs from base metadata
export const SUPPORTED_LOCALES: Locale[] = Object.keys(LOCALE_METADATA) as Locale[];

export const AVAILABLE_LOCALES: Record<Locale, { labelKey: string }> = Object.fromEntries(
  Object.keys(LOCALE_METADATA).map((lang) => [
    lang,
    { labelKey: `locale_label_${lang}` },
  ])
) as Record<Locale, { labelKey: string }>;

export const INTL_LOCALES: Record<Locale, string> = Object.fromEntries(
  Object.entries(LOCALE_METADATA).map(([lang, meta]) => [lang, meta.intlCode])
) as Record<Locale, string>;
