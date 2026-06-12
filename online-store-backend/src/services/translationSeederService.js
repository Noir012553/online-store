const StaticTranslation = require('../models/StaticTranslation');
const fs = require('fs');
const path = require('path');

class TranslationSeederService {
  /**
   * Clone static translations from source language to target language
   * Used when admin adds a new language to system
   * @param {string} sourceCode - Source language code (e.g., 'en')
   * @param {string} targetCode - Target language code (e.g., 'pt')
   * @returns {Promise<number>} Number of records cloned
   */
  static async cloneStaticTranslations(sourceCode = 'en', targetCode) {
    if (!sourceCode || !targetCode) {
      throw new Error('Source and target language codes are required');
    }

    if (sourceCode === targetCode) {
      throw new Error('Source and target languages must be different');
    }

    try {
      console.log(`[TranslationSeeder] Starting clone from ${sourceCode} to ${targetCode}`);

      // Check if target language already has translations
      const existingCount = await StaticTranslation.countDocuments({
        code: targetCode,
      });

      if (existingCount > 0) {
        console.log(
          `[TranslationSeeder] Language ${targetCode} already has ${existingCount} records`
        );
        return existingCount;
      }

      // Fetch all source language translations from DB
      let sourceTranslations = await StaticTranslation.find({
        code: sourceCode,
        isDeleted: false,
      }).lean();

      console.log(`[TranslationSeeder] Found ${sourceTranslations.length} source records in DB`);

      // If DB doesn't have source translations, load from JSON files
      if (sourceTranslations.length === 0) {
        console.log(`[TranslationSeeder] Source language not in DB, loading from JSON files...`);
        sourceTranslations = await this._loadTranslationsFromJSON(sourceCode);
        console.log(`[TranslationSeeder] Loaded ${sourceTranslations.length} records from JSON files`);
      }

      if (sourceTranslations.length === 0) {
        console.warn(
          `[TranslationSeeder] No source translations found for language ${sourceCode}`
        );
        return 0;
      }

      // Clone translations: replace language code and remove MongoDB IDs
      const clonedTranslations = sourceTranslations.map(trans => ({
        code: targetCode,
        namespace: trans.namespace,
        translations: trans.translations, // Keep original translations as fallback
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Batch insert cloned translations
      const result = await StaticTranslation.insertMany(clonedTranslations, {
        ordered: false,
      });

      console.log(
        `[TranslationSeeder] Successfully cloned ${result.length} translation records for ${targetCode}`
      );

      return result.length;
    } catch (error) {
      // Ignore duplicate key errors (likely from retries)
      if (error.code === 11000) {
        console.warn(
          `[TranslationSeeder] Duplicate key error - translations may already exist for ${targetCode}`
        );
        return 0;
      }
      console.error(`[TranslationSeeder] Error cloning translations:`, error.message);
      throw error;
    }
  }

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

  /**
   * Translate all static UI strings from source language to target language
   * Called after cloneStaticTranslations to actually translate the cloned content
   * @param {string} targetLang - Target language code (e.g., 'pt')
   * @param {string} sourceLang - Source language code (defaults to 'en')
   * @returns {Promise<number>} Number of records translated
   */
  static async translateStaticTranslations(targetLang, sourceLang = 'en') {
    if (!targetLang || targetLang === sourceLang) {
      throw new Error('Target language must be different from source language');
    }

    try {
      const cloudflareAiService = require('./cloudflareAiService');

      console.log(`[TranslationSeeder] Starting translation of UI strings from ${sourceLang} to ${targetLang}`);

      // Get all cloned records in the target language
      const targetRecords = await StaticTranslation.find({
        code: targetLang,
        isDeleted: false,
      });

      if (targetRecords.length === 0) {
        console.warn(`[TranslationSeeder] No records found for language ${targetLang} to translate`);
        return 0;
      }

      let totalTranslated = 0;
      let totalErrors = 0;

      // Translate each namespace
      for (const record of targetRecords) {
        try {
          const translatedKeys = {};
          const keyCount = Object.keys(record.translations || {}).length;

          console.log(`[TranslationSeeder] Translating namespace '${record.namespace}' (${keyCount} keys) to ${targetLang}`);

          // Translate each key
          for (const [key, englishValue] of Object.entries(record.translations || {})) {
            try {
              // Skip empty values
              if (!englishValue || typeof englishValue !== 'string') {
                translatedKeys[key] = englishValue;
                continue;
              }

              const translated = await cloudflareAiService.translate(
                englishValue,
                sourceLang,
                targetLang
              );

              translatedKeys[key] = translated;
              totalTranslated++;
            } catch (err) {
              console.error(
                `[TranslationSeeder] Failed to translate key '${key}' in namespace '${record.namespace}':`,
                err.message
              );
              // Fallback to original (English) value
              translatedKeys[key] = englishValue;
              totalErrors++;
            }
          }

          // Update record with translated data
          await StaticTranslation.updateOne(
            { _id: record._id },
            { translations: translatedKeys, updatedAt: new Date() }
          );

          console.log(
            `[TranslationSeeder] Namespace '${record.namespace}' translation completed`
          );
        } catch (err) {
          console.error(
            `[TranslationSeeder] Error processing namespace '${record.namespace}':`,
            err.message
          );
          totalErrors += Object.keys(record.translations || {}).length;
        }
      }

      console.log(
        `[TranslationSeeder] UI translation completed. Total translated: ${totalTranslated}, Errors: ${totalErrors}`
      );

      return totalTranslated;
    } catch (error) {
      console.error(`[TranslationSeeder] Error translating static translations:`, error.message);
      throw error;
    }
  }
}

module.exports = TranslationSeederService;
