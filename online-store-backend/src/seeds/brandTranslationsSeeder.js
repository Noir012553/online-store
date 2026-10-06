const path = require('path');
const fs = require('fs');
const StaticTranslation = require('../models/StaticTranslation');
const { getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const seedBrandTranslations = async () => {
  console.log(`\n${CLI_SYMBOLS.edit} SEEDING BRAND TRANSLATIONS...\n`);

  const languages = getActiveLangCodes();
  let totalUpserted = 0;

  for (const lang of languages) {
    const productsPath = path.join(__dirname, `../locales/${lang}/products.json`);

    if (!fs.existsSync(productsPath)) {
      console.warn(`${CLI_SYMBOLS.warning}  File not found: ${productsPath}`);
      continue;
    }

    const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
    const translations = Object.fromEntries(
      Object.entries(products).filter(([key]) => key === 'brand_unknown'),
    );

    if (Object.keys(translations).length === 0) {
      console.warn(`${CLI_SYMBOLS.warning}  No brand_unknown found in ${lang}`);
      continue;
    }

    await StaticTranslation.updateOne(
      { code: lang, namespace: 'products' },
      { $set: { [`translations.brand_unknown`]: translations.brand_unknown } },
      { upsert: true },
    );
    totalUpserted += Object.keys(translations).length;
    console.log(`${CLI_SYMBOLS.success} Updated ${lang.toUpperCase()} translations`);
  }

  console.log(`\n${CLI_SYMBOLS.sparkles} SEEDING COMPLETE:`);
  console.log(`  ${CLI_SYMBOLS.bullet} Total translations upserted: ${totalUpserted}`);
  console.log(`  ${CLI_SYMBOLS.bullet} Languages processed: ${languages.length}\n`);

  return { totalUpserted, languagesProcessed: languages.length };
};

module.exports = seedBrandTranslations;
