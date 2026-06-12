/**
 * Language Seeder - Initialize system languages (Start with 2, expand gradually)
 *
 * Vietnamese: Primary/Standard language (isSystemDefault: true)
 * English: Secondary language (isSystemDefault: false)
 *
 * Other 7 languages (pt, fr, de, it, es, nl, sv) are added on-demand via API
 * Each time admin clicks "Add Language" button, they can add one new language
 */

const Language = require('../models/Language');

const SYSTEM_LANGUAGES = [
  {
    code: 'vi',
    name: 'Tiếng Việt',
    nativeName: 'Tiếng Việt',
    isActive: true,
    isSystemDefault: true,
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    isActive: true,
    isSystemDefault: false,
  },
];

const seedLanguages = async () => {
  try {
    console.log('\n🌍 Initializing system languages...');

    // Clear any non-system languages (remove ja, zh, ko, fr, de, es, th, etc)
    const systemCodes = SYSTEM_LANGUAGES.map(l => l.code);
    const deletedCount = await Language.deleteMany({
      code: { $nin: systemCodes },
    });

    if (deletedCount.deletedCount > 0) {
      console.log(`  ✓ Removed ${deletedCount.deletedCount} unsupported language(s)`);
    }

    let createdCount = 0;
    let updatedCount = 0;

    // Upsert system languages
    for (const lang of SYSTEM_LANGUAGES) {
      const existingLang = await Language.findOne({ code: lang.code });

      if (!existingLang) {
        await Language.create(lang);
        createdCount++;
      } else if (
        existingLang.isActive !== lang.isActive ||
        existingLang.isSystemDefault !== lang.isSystemDefault
      ) {
        await Language.updateOne(
          { code: lang.code },
          {
            isActive: lang.isActive,
            isSystemDefault: lang.isSystemDefault,
          }
        );
        updatedCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`  ✓ Created ${createdCount} language(s)`);
    }
    if (updatedCount > 0) {
      console.log(`  ✓ Updated ${updatedCount} language(s)`);
    }

    const allLanguages = await Language.find().lean();
    const summary = allLanguages
      .map(l => `${l.code} (${l.isSystemDefault ? 'DEFAULT' : 'secondary'})`)
      .join(', ');
    console.log(`  📍 System languages: ${summary}`);

    return allLanguages;
  } catch (error) {
    console.error('❌ Language seeding failed:', error.message);
    throw error;
  }
};

module.exports = seedLanguages;
