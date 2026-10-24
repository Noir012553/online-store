// Re-export all from localeMetadata (single source of truth)
import {
  type Locale,
  type LocaleMetadata,
  LOCALE_METADATA,
  SUPPORTED_LOCALES,
  AVAILABLE_LOCALES,
  INTL_LOCALES,
} from './localeMetadata';

export {
  type Locale,
  type LocaleMetadata,
  LOCALE_METADATA,
  SUPPORTED_LOCALES,
  AVAILABLE_LOCALES,
  INTL_LOCALES,
};

// Backend-driven SSOT: Namespace is any string
// Backend controls all valid namespaces via JSON files
// Frontend trusts Backend to validate at runtime
export type Namespace = string;

// DEFAULT_LOCALE: Derived from LOCALE_METADATA order (first is default)
// Can be overridden via NEXT_PUBLIC_DEFAULT_LOCALE env var
const DEFAULT_FROM_METADATA = SUPPORTED_LOCALES[0];
export const DEFAULT_LOCALE = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE || DEFAULT_FROM_METADATA) as Locale;
