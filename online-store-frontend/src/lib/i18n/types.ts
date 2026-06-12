export type Locale = 'vi' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'es' | 'nl' | 'sv';

// Backend-driven SSOT: Namespace is any string
// Backend controls all valid namespaces via JSON files
// Frontend trusts Backend to validate at runtime
export type Namespace = string;

export const SUPPORTED_LOCALES: Locale[] = ['vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv'];
export const DEFAULT_LOCALE: Locale = 'vi';

export const AVAILABLE_LOCALES: Record<Locale, { label: string; flag: string }> = {
  vi: { label: 'Tiếng Việt', flag: '🇻🇳' },
  en: { label: 'English', flag: '🇺🇸' },
  pt: { label: 'Português', flag: '🇵🇹' },
  fr: { label: 'Français', flag: '🇫🇷' },
  de: { label: 'Deutsch', flag: '🇩🇪' },
  it: { label: 'Italiano', flag: '🇮🇹' },
  es: { label: 'Español', flag: '🇪🇸' },
  nl: { label: 'Nederlands', flag: '🇳🇱' },
  sv: { label: 'Svenska', flag: '🇸🇪' },
};
