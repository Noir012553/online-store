const StaticTranslation = require('../models/StaticTranslation');

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

      // Fetch all source language translations
      const sourceTranslations = await StaticTranslation.find({
        code: sourceCode,
        isDeleted: false,
      }).lean();

      console.log(`[TranslationSeeder] Found ${sourceTranslations.length} source records`);

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
}

module.exports = TranslationSeederService;
