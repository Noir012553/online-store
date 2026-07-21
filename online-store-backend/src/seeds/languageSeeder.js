/**
 * Language Seeder - Initialize all 9 supported system languages
 * Single Source of Truth from languageInventory.js
 *
 * Vietnamese: Primary/Standard language (isSystemDefault: true)
 * English + 7 others: Active secondary languages
 */

const Language = require('../models/Language');
const { SUPPORTED_LANGUAGES } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const seedLanguages = async () => {
  try {
    console.log(`\n${CLI_SYMBOLS.world} Initializing all 9 system languages...`);

    // Clear any unsupported languages (keep only what's in SUPPORTED_LANGUAGES)
    const supportedCodes = SUPPORTED_LANGUAGES.map(l => l.code);
    const deletedCount = await Language.deleteMany({
      code: { $nin: supportedCodes },
    });

    if (deletedCount.deletedCount > 0) {
      console.log(`  ${CLI_SYMBOLS.check} Removed ${deletedCount.deletedCount} unsupported language(s)`);
    }

    let createdCount = 0;
    let updatedCount = 0;

    // Upsert all 9 languages from inventory
    for (const lang of SUPPORTED_LANGUAGES) {
      const existingLang = await Language.findOne({ code: lang.code });

      if (!existingLang) {
        await Language.create({
          code: lang.code,
          name: lang.name,
          nativeName: lang.nativeName,
          isActive: lang.isActive,
          isSystemDefault: lang.isSystemDefault,
          currencyCode: lang.currencyCode,
          isReady: true,
        });
        createdCount++;
      } else if (
        existingLang.isActive !== lang.isActive ||
        existingLang.isSystemDefault !== lang.isSystemDefault ||
        existingLang.currencyCode !== lang.currencyCode ||
        existingLang.nativeName !== lang.nativeName ||
        !existingLang.isReady
      ) {
        await Language.updateOne(
          { code: lang.code },
          {
            isActive: lang.isActive,
            isSystemDefault: lang.isSystemDefault,
            nativeName: lang.nativeName,
            currencyCode: lang.currencyCode,
            isReady: true,
          }
        );
        updatedCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`  ${CLI_SYMBOLS.check} Created ${createdCount} language(s)`);
    }
    if (updatedCount > 0) {
      console.log(`  ${CLI_SYMBOLS.check} Updated ${updatedCount} language(s)`);
    }

    const allLanguages = await Language.find().lean();
    const summary = allLanguages
      .map(l => `${l.code} (${l.isSystemDefault ? 'DEFAULT' : 'secondary'})`)
      .join(', ');
    console.log(`  ${CLI_SYMBOLS.location} All 9 languages ready: ${summary}`);

    return allLanguages;
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Language seeding failed:`, error.message);
    throw error;
  }
};

module.exports = seedLanguages;
