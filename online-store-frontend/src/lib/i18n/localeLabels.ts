import { Locale } from './types';

export const LOCALE_LABEL_KEYS: Record<Locale, string> = {
  vi: 'language_vietnamese',
  en: 'language_english',
  pt: 'language_portuguese',
  fr: 'language_french',
  de: 'language_german',
  it: 'language_italian',
  es: 'language_spanish',
  nl: 'language_dutch',
  sv: 'language_swedish',
};

export const getLanguageLabelKey = (lang: Locale): string => {
  return LOCALE_LABEL_KEYS[lang] || lang;
};
