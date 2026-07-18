const Language = require('../models/Language');

// In-memory cache: active language codes with simple TTL
let cachedLanguages = null;
let cacheExpiry = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_KEY = 'active_languages';

class LanguageService {
  /**
   * Get all active language codes from DB
   * Uses in-memory cache (simple TTL) for performance
   * @returns {Promise<string[]>} Array of language codes like ['vi', 'en', 'pt']
   */
  static async getActiveLanguageCodes() {
    // Check if cache is still valid
    if (cachedLanguages && cacheExpiry && Date.now() < cacheExpiry) {
      console.log('[LanguageService] Returning cached active languages:', cachedLanguages);
      return cachedLanguages;
    }

    try {
      // Query DB for active languages
      const languages = await Language.find(
        { isActive: true },
        { code: 1 }
      ).lean();

      const codes = languages.map(lang => lang.code);
      console.log('[LanguageService] Fetched active languages from DB:', codes);

      // Cache result with expiry
      cachedLanguages = codes;
      cacheExpiry = Date.now() + CACHE_TTL;

      return codes;
    } catch (error) {
      console.error('[LanguageService] Error fetching active languages:', error);
      // Fallback to all 9 languages from config if DB fails
      const { getActiveLangCodes } = require('../config/languageInventory');
      return getActiveLangCodes();
    }
  }

  /**
   * Invalidate cache when language is added/removed/updated
   */
  static invalidateCache() {
    cachedLanguages = null;
    cacheExpiry = null;
    console.log('[LanguageService] Cache invalidated');
  }

  /**
   * Check if a language code is supported (active in system)
   * @param {string} langCode
   * @returns {Promise<boolean>}
   */
  static async isSupportedLanguage(langCode) {
    if (!langCode) return false;
    const codes = await this.getActiveLanguageCodes();
    return codes.includes(langCode.toLowerCase());
  }

  /**
   * Get language by code (with caching)
   * @param {string} code
   * @returns {Promise<Object>}
   */
  static async getLanguageByCode(code) {
    try {
      return await Language.findOne({ code: code.toLowerCase() }).lean();
    } catch (error) {
      console.error('[LanguageService] Error fetching language:', error);
      return null;
    }
  }
}

module.exports = LanguageService;
