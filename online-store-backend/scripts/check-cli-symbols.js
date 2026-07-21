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
  'src/services/cloudflareAiService.js',
  'src/services/distributedLockService.js',
];
const emojiPattern = /[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u;

const findings = checkedFiles
  .filter((filePath) => fs.existsSync(path.join(rootDir, filePath)))
  .filter((filePath) => emojiPattern.test(fs.readFileSync(path.join(rootDir, filePath), 'utf8')));

if (findings.length > 0) {
  console.error('CLI symbols must be referenced from src/utils/cliSymbols.js:');
  findings.forEach((filePath) => console.error(`- ${filePath}`));
  process.exit(1);
}

console.log('No hard-coded CLI symbols found in enforced runtime entry points.');
