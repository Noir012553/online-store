// Re-export i18n types and providers
export {
  type Locale,
  type Namespace,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  AVAILABLE_LOCALES,
} from './types';
export {
  LanguageProvider,
  useLanguage,
  useTranslation,
} from '../context/LanguageContext';
