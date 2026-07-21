const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const checkedFiles = [
  'src/i18n/messages.js',
  'src/seeds/seedRegistry.js',
  'src/test/test-runner.js',
  'src/test/testRegistry.js',
  'src/utils/fileCleanup.js',
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
