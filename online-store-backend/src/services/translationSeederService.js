const fs = require('fs');
const fs = require('fs');
const path = require('path');
const StaticTranslation = require('../models/StaticTranslation');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { flattenJson, unflattenJson } = require('../utils/jsonFlattener');
const TranslationCacheService = require('./translationCacheService');

class TranslationSeederService {
  /**
   * Load translations from JSON files for a language
   * Fallback method when DB doesn't have data
   * @param {string} langCode - Language code (e.g., 'en')
   * @returns {Promise<Object[]>} Array of translation objects
   */
  static async _loadTranslationsFromJSON(langCode) {
    try {
      const LOCALES_PATH = path.join(__dirname, '../locales');
      const langPath = path.join(LOCALES_PATH, langCode);

      if (!fs.existsSync(langPath)) {
        console.warn(`[TranslationSeeder] No locale directory found for ${langCode}`);
        return [];
      }

      const files = fs.readdirSync(langPath).filter(f => f.endsWith('.json'));
      const translations = [];

      for (const file of files) {
        const filePath = path.join(langPath, file);
        const namespace = file.replace('.json', '');

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);

          translations.push({
            code: langCode,
            namespace,
            translations: data,
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } catch (err) {
          console.error(`[TranslationSeeder] Error reading ${file}:`, err.message);
        }
      }

      return translations;
    } catch (error) {
      console.error(`[TranslationSeeder] Error loading translations from JSON:`, error.message);
      return [];
    }
  }

  /**
   * Check if a language has static translations seeded
   * @param {string} code
   * @returns {Promise<boolean>}
   */
  static async hasStaticTranslations(code) {
    const count = await StaticTranslation.countDocuments({
      code,
      isDeleted: false,
    });
    return count > 0;
  }

  /**
   * Get translation namespaces available for a language
   * @param {string} code
   * @returns {Promise<string[]>}
   */
  static async getNamespacesForLanguage(code) {
    const translations = await StaticTranslation.find(
      { code, isDeleted: false },
      { namespace: 1 }
    ).lean();

    return translations.map(t => t.namespace);
  }

  static async translateStaticTranslations(targetLang, sourceLang = getDefaultLanguage().code) {
    if (!targetLang || targetLang === sourceLang) {
      throw new Error('Target language must be different from source language');
    }

    const cloudflareAiService = require('./cloudflareAiService');
    let sourceRecords = await StaticTranslation.find({ code: sourceLang, isDeleted: false }).lean();
    if (sourceRecords.length === 0) {
      sourceRecords = await this._loadTranslationsFromJSON(sourceLang);
    }
    if (sourceRecords.length === 0) {
      throw new Error(`No source translations found for ${sourceLang}`);
    }

    let totalTranslated = 0;
    let totalErrors = 0;
    const concurrencyLimit = 5;
    const throttleMs = 1000;

    for (const record of sourceRecords) {
      const sourceEntries = Object.entries(flattenJson(record.translations || {}));
      const translatedEntries = {};

      for (let offset = 0; offset < sourceEntries.length; offset += concurrencyLimit) {
        const batch = sourceEntries.slice(offset, offset + concurrencyLimit);
        const results = await Promise.all(batch.map(async ([key, sourceValue]) => {
          if (typeof sourceValue !== 'string' || !sourceValue.trim()) {
            return { key, value: sourceValue };
          }

          try {
            const translated = await cloudflareAiService.translate(sourceValue, sourceLang, targetLang);
            if (typeof translated !== 'string' || !translated.trim()) {
              throw new Error('Cloudflare returned empty translation');
            }
            return { key, value: translated };
          } catch (error) {
            totalErrors++;
            console.warn(`[TranslationSeeder] Translation failed for '${key}' (${record.namespace}): ${error.message}`);
            return { key, error: true };
          }
        }));

        results.forEach(({ key, value, error }) => {
          if (error) return;
          translatedEntries[key] = value;
          if (typeof value === 'string' && value.trim()) totalTranslated++;
        });

        if (offset + concurrencyLimit < sourceEntries.length) await this._sleep(throttleMs);
      }

      await StaticTranslation.updateOne(
        { code: targetLang, namespace: record.namespace },
        {
          $set: {
            code: targetLang,
            namespace: record.namespace,
            translations: unflattenJson(translatedEntries),
            isDeleted: false,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    TranslationCacheService.invalidateLanguage(targetLang);
    console.log(`[TranslationSeeder] PHASE 1 completed: ${totalTranslated} translated keys, ${totalErrors} errors`);
    return { translatedCount: totalTranslated, errorCount: totalErrors };
  }

  /**
   * Sleep utility for throttling
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  static _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TranslationSeederService;
