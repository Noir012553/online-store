const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const checkedFiles = [
  'src/controllers/languageController.js',
  'src/controllers/productImportController.js',
  'src/controllers/shippingProviderController.js',
  'src/i18n/messages.js',
  'src/seeds/seedRegistry.js',
  'src/test/test-runner.js',
  'src/test/testRegistry.js',
  'src/utils/fileCleanup.js',
  'src/utils/translationReporter.js',
  'scripts/backup-livetranslationcache.js',
  'scripts/diagnose-old-schema.js',
  'scripts/fix-fallback-translations.js',
  'scripts/init-uploads.js',
  'scripts/rebuild-critical-indexes.js',
  'scripts/force-regenerate-translations.js',
  'scripts/clear-and-migrate.js',
  'scripts/setup-production-indexes.js',
  'scripts/setup-i18n-indexes.js',
  'scripts/health-check-i18n.js',
  'src/seeds/addressSeeder.js',
  'src/seeds/brandTranslationsSeeder.js',
  'src/seeds/exchangeRateHistorySeeder.js',
  'src/seeds/featuresTranslationSeeder.js',
  'src/seeds/locationSeeder.js',
  'src/seeds/productSeeder.js',
  'src/seeds/retranslateSeeder.js',
  'src/seeds/bannerSlotLabelsSeeder.js',
  'src/seeds/testimonialLabelsSeeder.js',
  'src/seeds/i18nOnlySeeder.js',
  'src/seeds/languageSeeder.js',
  'src/seeds/shippingProviderSeeder.js',
  'src/seeds/specTranslationSeeder.js',
  'src/services/cloudflareAiService.js',
  'src/services/distributedLockService.js',
  'src/scripts/check-sync-status.js',
  'src/scripts/verify-language-inventory.js',
  'src/scripts/verify-translations-loaded.js',
  'src/scripts/translateHistory.js',
  'src/scripts/batch-translate-locales.js',
  'src/scripts/translate-locales.js',
  'src/scripts/seedWithVersionControl.js',
  'src/scripts/check-translation-cache.js',
  'src/scripts/check-live-cache.js',
  'src/scripts/check-translation-names.js',
  'src/scripts/find-missing-en-keys.js',
  'src/scripts/translateApprove.js',
  'src/scripts/translateRejectAll.js',
  'src/scripts/fixCategoryNames.js',
  'src/scripts/verify-no-english-fallback.js',
  'src/scripts/migrate-translations.js',
  'src/scripts/translateReport.js',
  'src/scripts/find-english-fallbacks.js',
];
const cliSymbolPattern = /[\u{1F000}-\u{1FAFF}\u2190-\u21FF\u2500-\u259F\u2600-\u27BF]/u;
const consoleOutputPattern = /console\.(?:log|warn|error|time|timeEnd)\(/;

const findings = checkedFiles
  .filter((filePath) => fs.existsSync(path.join(rootDir, filePath)))
  .filter((filePath) => fs.readFileSync(path.join(rootDir, filePath), 'utf8')
    .split(/\r?\n/)
    .some((line) => consoleOutputPattern.test(line) && cliSymbolPattern.test(line)));

if (findings.length > 0) {
  console.error('CLI symbols must be referenced from src/utils/cliSymbols.js:');
  findings.forEach((filePath) => console.error(`- ${filePath}`));
  process.exit(1);
}

console.log('No hard-coded CLI symbols found in enforced runtime entry points.');
