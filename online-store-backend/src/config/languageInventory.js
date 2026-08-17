/**
 * Language Inventory - Single Source of Truth for 9 supported languages
 * Defines language codes, translation keys, and metadata (priority, active status, default)
 * Display names MUST be retrieved from locales via admin_lang_* translation keys.
 * This ensures all UI strings follow the no-hardcoding rule.
 */

// Unified with Frontend: online-store-frontend/src/lib/i18n/types.ts
// SUPPORTED_LOCALES sequence: ['vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv']
const SUPPORTED_LANGUAGES = [
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    translationKey: 'admin_lang_vi',
    isActive: true,
    isSystemDefault: true,
    currencyCode: 'VND',
    priority: 1,
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    translationKey: 'admin_lang_en',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'USD',
    priority: 2,
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    translationKey: 'admin_lang_pt',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'EUR',
    priority: 3,
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    translationKey: 'admin_lang_fr',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'EUR',
    priority: 4,
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    translationKey: 'admin_lang_de',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'EUR',
    priority: 5,
  },
  {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    translationKey: 'admin_lang_it',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'EUR',
    priority: 6,
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    translationKey: 'admin_lang_es',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'EUR',
    priority: 7,
  },
  {
    code: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands',
    translationKey: 'admin_lang_nl',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'EUR',
    priority: 8,
  },
  {
    code: 'sv',
    name: 'Swedish',
    nativeName: 'Svenska',
    translationKey: 'admin_lang_sv',
    isActive: true,
    isSystemDefault: false,
    currencyCode: 'SEK',
    priority: 9,
  },
];

/**
 * Get all active language codes
 */
const getActiveLangCodes = () => {
  return SUPPORTED_LANGUAGES.filter(l => l.isActive).map(l => l.code);
};

/**
 * Check if language is supported
 */
const isSupportedLanguage = (code) => {
  return SUPPORTED_LANGUAGES.some(l => l.code === code && l.isActive);
};

/**
 * Get language by code
 */
const getLanguageByCode = (code) => {
  return SUPPORTED_LANGUAGES.find(l => l.code === code);
};

/**
 * Get default language (Vietnamese)
 */
const getDefaultLanguage = () => {
  return SUPPORTED_LANGUAGES.find(l => l.isSystemDefault);
};

/**
 * Get Intl locale string from language code
 * Used for Date/Number formatting across all 9 languages
 */
const getIntlLocale = (langCode) => {
  const INTL_LOCALES_MAP = {
    'vi': 'vi-VN',
    'en': 'en-US',
    'pt': 'pt-PT',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT',
    'es': 'es-ES',
    'nl': 'nl-NL',
    'sv': 'sv-SE',
  };
  const defaultLang = getDefaultLanguage().code;
  return INTL_LOCALES_MAP[langCode] || INTL_LOCALES_MAP[defaultLang];
};

/**
 * Get language names in English for scripts/tools (e.g. 'Vietnamese', 'English')
 * Used by translation scripts to identify language names
 */
const getLanguageNames = () => {
  const LANG_NAME_MAP = {
    'vi': 'Vietnamese',
    'en': 'English',
    'pt': 'Portuguese',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'es': 'Spanish',
    'nl': 'Dutch',
    'sv': 'Swedish',
  };
  return LANG_NAME_MAP;
};

module.exports = {
  SUPPORTED_LANGUAGES,
  getActiveLangCodes,
  isSupportedLanguage,
  getLanguageByCode,
  getDefaultLanguage,
  getIntlLocale,
  getLanguageNames,
};
