const fs = require('fs');
const path = require('path');
const { SUPPORTED_LANGUAGES, getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const EXPECTED_LANGUAGE_CODES = ['vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv'];
const EXPECTED_NAMESPACES = [
  'about', 'admin-audit-log', 'admin-banners', 'admin-common', 'admin-controllers-messages', 'admin-coupons', 'admin-customers', 'admin-errors', 'admin-export', 'admin-i18n-monitoring', 'admin-import', 'admin-notifications', 'admin-orders', 'admin-translation-batch', 'admin-translation-override', 'admin-translation', 'admin-users', 'admin', 'api-errors', 'api', 'auth-messages', 'auth', 'banner', 'breadcrumbs', 'cart', 'categories', 'checkout', 'common', 'components', 'contact', 'coupons', 'customers', 'dashboard', 'email', 'errors', 'exchange-rate', 'export', 'footer', 'frontend-error-handler', 'frontend-errors', 'frontend-import', 'home', 'homepage-banners-seed', 'import', 'login', 'newsletter', 'notifications', 'order-confirmation', 'order-success', 'orders', 'pages', 'pagination', 'payment-messages', 'payment', 'policies', 'product-seeder-messages', 'product-ui', 'products', 'productsTranslations', 'profile', 'review', 'seeder-messages', 'shipment', 'shipping-messages', 'shipping-providers-seed', 'shipping', 'shopping-guide', 'statistics', 'testimonial', 'translation-messages', 'ui-common', 'ui-loading', 'user-messages', 'user', 'users', 'validation',
];
const localesPath = path.join(__dirname, '../locales');
const skipDatabase = process.argv.includes('--skip-database');

function difference(left, right) {
  return left.filter((value) => !right.includes(value));
}

function listNamespaceFiles(language) {
  const languagePath = path.join(localesPath, language);
  if (!fs.existsSync(languagePath)) return null;
  return fs.readdirSync(languagePath)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .sort();
}

async function verifyLanguageInventory() {
  const failures = [];
  const configuredCodes = getActiveLangCodes();
  const configuredOrderMatches = configuredCodes.join(',') === EXPECTED_LANGUAGE_CODES.join(',');
  const configDefinitionsMatch = SUPPORTED_LANGUAGES.map((language) => language.code).join(',') === EXPECTED_LANGUAGE_CODES.join(',');

  console.log(`\n${CLI_SYMBOLS.search} Verifying language inventory...\n`);
  console.log(`${CLI_SYMBOLS.list} [1/3] Checking configured languages...`);

  if (configuredOrderMatches && configDefinitionsMatch) {
    console.log(`  ${CLI_SYMBOLS.success} Expected active languages: ${EXPECTED_LANGUAGE_CODES.join(', ')}`);
  } else {
    failures.push(`Configured languages must be exactly: ${EXPECTED_LANGUAGE_CODES.join(', ')}`);
    console.log(`  ${CLI_SYMBOLS.error} Active languages: ${configuredCodes.join(', ')}`);
  }

  console.log(`\n${CLI_SYMBOLS.folder} [2/3] Checking locale namespaces...`);
  for (const language of EXPECTED_LANGUAGE_CODES) {
    const namespaceFiles = listNamespaceFiles(language);
    if (!namespaceFiles) {
      failures.push(`Missing locale directory: ${language}`);
      console.log(`  ${CLI_SYMBOLS.error} ${language}: directory is missing`);
      continue;
    }

    const missing = difference(EXPECTED_NAMESPACES, namespaceFiles);
    const unexpected = difference(namespaceFiles, EXPECTED_NAMESPACES);
    if (missing.length === 0 && unexpected.length === 0) {
      console.log(`  ${CLI_SYMBOLS.success} ${language}: ${namespaceFiles.length} expected namespaces`);
      continue;
    }

    if (missing.length > 0) failures.push(`${language}: missing namespaces ${missing.join(', ')}`);
    if (unexpected.length > 0) failures.push(`${language}: unexpected namespaces ${unexpected.join(', ')}`);
    console.log(`  ${CLI_SYMBOLS.error} ${language}: ${missing.length} missing, ${unexpected.length} unexpected namespaces`);
  }

  if (skipDatabase) {
    console.log(`\n${CLI_SYMBOLS.database} [3/3] Database check skipped.`);
  } else {
    console.log(`\n${CLI_SYMBOLS.database} [3/3] Checking database inventory...`);
    try {
      require('dotenv').config();
      const mongoose = require('mongoose');
      const Language = require('../models/Language');
      const StaticTranslation = require('../models/StaticTranslation');
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/online-store-dev');
      const dbLanguages = await Language.find().lean();
      const dbCodes = dbLanguages.map((language) => language.code).sort();
      const expectedCodes = [...EXPECTED_LANGUAGE_CODES].sort();
      if (dbCodes.join(',') !== expectedCodes.join(',')) {
        failures.push(`Database languages must be exactly: ${EXPECTED_LANGUAGE_CODES.join(', ')}`);
      }

      const translationCodes = (await StaticTranslation.distinct('code', { isDeleted: false })).sort();
      if (translationCodes.join(',') !== expectedCodes.join(',')) {
        failures.push(`Translation records must exist for: ${EXPECTED_LANGUAGE_CODES.join(', ')}`);
      }

      console.log(`  ${failures.length === 0 ? CLI_SYMBOLS.success : CLI_SYMBOLS.warning} Database language records: ${dbCodes.join(', ')}`);
      await mongoose.disconnect();
    } catch (error) {
      failures.push(`Database check failed: ${error.message}`);
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
  }

  console.log(`\n${CLI_SYMBOLS.chart} VERIFICATION RESULTS`);
  console.log(CLI_SYMBOLS.heavyDivider.repeat(31));
  console.log(`Expected languages: ${EXPECTED_LANGUAGE_CODES.length}`);
  console.log(`Expected namespaces per language: ${EXPECTED_NAMESPACES.length}`);

  if (failures.length > 0) {
    failures.forEach((failure) => console.log(`${CLI_SYMBOLS.error} ${failure}`));
    process.exit(1);
  }

  console.log(`${CLI_SYMBOLS.success} Language inventory is consistent.`);
}

verifyLanguageInventory().catch((error) => {
  console.error(`${CLI_SYMBOLS.error} Verification failed: ${error.message}`);
  process.exit(1);
});
