/**
 * Centralized internationalization (i18n) system
 * Load translations từ JSON files: src/locales/{lang}/*.json
 * Hỗ trợ 9 ngôn ngữ: VI, EN, PT, FR, DE, IT, ES, NL, SV
 *
 * Architecture:
 * - All translations are loaded from JSON files on startup
 * - Fallback chain: Requested Language → Other Languages (in SUPPORTED_LANGS order)
 * - Caching: Translations are cached in memory to avoid repeated file I/O
 * - Default Language: Vietnamese (vi) - See config/languageInventory.js
 */

const path = require('path');
const fs = require('fs');
const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

const SUPPORTED_LANGS = getActiveLangCodes();
const translations = {};
let loadedLanguages = new Set();

/**
 * Load all translations from JSON files for supported languages
 * Translations are cached in memory after first load
 */
const loadTranslationsCache = () => {
  if (Object.keys(translations).length === 0) {
    const startTime = Date.now();
    let totalFiles = 0;
    let failedFiles = 0;

    SUPPORTED_LANGS.forEach(lang => {
      translations[lang] = {};
      const langDir = path.join(__dirname, '..', 'locales', lang);

      if (fs.existsSync(langDir)) {
        const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
        
        files.forEach(file => {
          try {
            const namespace = file.replace('.json', '');
            const filePath = path.join(langDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            translations[lang][namespace] = JSON.parse(content);
            totalFiles++;
          } catch (err) {
            console.warn(`⚠️  Failed to load ${lang}/${file}:`, err.message);
            failedFiles++;
          }
        });

        if (files.length > 0) {
          loadedLanguages.add(lang);
          console.log(`✅ Loaded ${files.length} translation files for ${lang.toUpperCase()}`);
        }
      } else {
        console.warn(`⚠️  Language directory not found: ${langDir}`);
      }
    });

    const loadTime = Date.now() - startTime;
    console.log(`\n📊 Translation System Status:`);
    console.log(`   ✅ Total files loaded: ${totalFiles}`);
    console.log(`   ⚠️  Failed files: ${failedFiles}`);
    console.log(`   🗣️  Languages available: ${Array.from(loadedLanguages).join(', ').toUpperCase()}`);
    console.log(`   ⏱️  Load time: ${loadTime}ms\n`);
  }
  return translations;
};

/**
 * Substitute placeholders in message (e.g., {{count}}, {{error}})
 *
 * @param {String} message - Message with placeholders
 * @param {Object} values - Key-value pairs for substitution
 * @returns {String} Message with substituted values
 *
 * @example
 * substituteMessage('Found {{count}} items', { count: 5 })
 * // Returns: 'Found 5 items'
 */
const substituteMessage = (message, values = {}) => {
  if (!message || typeof message !== 'string') return message;

  let result = message;
  Object.entries(values).forEach(([key, value]) => {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(placeholder, String(value));
  });

  return result;
};

/**
 * Get message by language and dot-notation path
 *
 * @param {String} lang - Language code (vi, en, pt, fr, de, it, es, nl, sv)
 * @param {String} path - Dot-notation path (e.g., 'email.verification.subject')
 * @param {Object} values - Optional key-value pairs for placeholder substitution
 * @returns {String} Translated message or fallback to other languages, or original path if not found
 *
 * @example
 * getMessage('de', 'orders.notFound')
 * getMessage('pt', 'payment.amountInvalid', { count: 5, error: 'Network timeout' })
 */
const getMessage = (lang, path, values = {}) => {
  if (!path) {
    console.warn(`⚠️  getMessage called with empty path for language: ${lang}`);
    return path;
  }

  const allTrans = loadTranslationsCache();
  const DEFAULT_LANG = getDefaultLanguage().code;
  const validLang = (lang || DEFAULT_LANG).toLowerCase();

  const getValueByPath = (obj, dotPath) => {
    if (!obj || typeof obj !== 'object') return null;

    const keys = dotPath.split('.');
    let result = obj;

    for (const key of keys) {
      if (!result || typeof result !== 'object') return null;
      result = result[key];
    }

    return result || null;
  };

  // Parse namespace from path (first segment before dot)
  const pathParts = path.split('.');
  const namespace = pathParts[0];
  const subPath = path.substring(namespace.length + 1);

  let result = null;

  // Try requested language first
  if (SUPPORTED_LANGS.includes(validLang)) {
    const langTrans = allTrans[validLang] || {};
    if (langTrans[namespace]) {
      const value = getValueByPath(langTrans[namespace], subPath);
      if (value) result = value;
    }
  }

  // Fallback to other languages (in order of priority)
  if (!result) {
    for (const fallbackLang of SUPPORTED_LANGS) {
      if (fallbackLang === validLang) continue;

      const fallbackTrans = allTrans[fallbackLang] || {};
      if (fallbackTrans[namespace]) {
        const value = getValueByPath(fallbackTrans[namespace], subPath);
        if (value) {
          console.warn(`⚠️  Fallback from ${validLang} to ${fallbackLang} for: ${path}`);
          result = value;
          break;
        }
      }
    }
  }

  // No translation found - return original path as is
  if (!result) {
    console.error(`❌ Translation not found: ${validLang}/${path}`);
    result = path;
  }

  // Substitute placeholders if values provided
  return substituteMessage(result, values);
};

/**
 * Alias for getMessage - get message from translation JSON files
 * Use this when you want to be explicit about getting from translations
 *
 * @param {String} lang - Language code
 * @param {String} path - Dot-notation path
 * @returns {String} Translated message
 */
const getMessageFromTranslations = (lang, path) => {
  const defaultLang = lang || getDefaultLanguage().code.toUpperCase();
  return getMessage(defaultLang, path);
};

/**
 * Get all supported languages
 * @returns {Array} Array of supported language codes
 */
const getSupportedLanguages = () => {
  return [...SUPPORTED_LANGS];
};

/**
 * Get status of loaded translations
 * @returns {Object} Status object with loaded languages and file counts
 */
const getTranslationStatus = () => {
  loadTranslationsCache();
  return {
    supportedLanguages: SUPPORTED_LANGS,
    loadedLanguages: Array.from(loadedLanguages),
    totalNamespaces: Object.keys(translations[SUPPORTED_LANGS[0]] || {}).length,
  };
};

module.exports = {
  getMessage,
  substituteMessage,
  getMessageFromTranslations,
  getSupportedLanguages,
  getTranslationStatus,
  SUPPORTED_LANGS,
  loadTranslationsCache,
};
