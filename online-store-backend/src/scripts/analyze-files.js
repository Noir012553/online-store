const fs = require('fs');
const path = require('path');
const { getDefaultLanguage } = require('../config/languageInventory');

const DEFAULT_LANG = getDefaultLanguage().code;
const DEFAULT_LANG_DIR = path.join(__dirname, `../locales/${DEFAULT_LANG}`);
const files = fs.readdirSync(DEFAULT_LANG_DIR).filter(f => f.endsWith('.json')).sort();

const skipFiles = ['admin-i18n-monitoring.json', 'admin-import.json', 'admin-notifications.json', 'banner.json'];
const toTranslate = files.filter(f => !skipFiles.includes(f));

const report = toTranslate.map(filename => {
  const content = JSON.parse(fs.readFileSync(path.join(DEFAULT_LANG_DIR, filename), 'utf8'));
  const keyCount = Object.keys(content).length;
  return { filename, keyCount };
}).sort((a, b) => b.keyCount - a.keyCount);

console.log('\n📊 Files needing translation (sorted by key count):\n');
console.log('CRITICAL (100+ keys):');
report.filter(f => f.keyCount >= 100).forEach(f => {
  console.log(`  - ${f.filename} (${f.keyCount} keys)`);
});

console.log('\nHIGH (50-99 keys):');
report.filter(f => f.keyCount >= 50 && f.keyCount < 100).forEach(f => {
  console.log(`  - ${f.filename} (${f.keyCount} keys)`);
});

console.log('\nMEDIUM (20-49 keys):');
report.filter(f => f.keyCount >= 20 && f.keyCount < 50).forEach(f => {
  console.log(`  - ${f.filename} (${f.keyCount} keys)`);
});

console.log('\nLOW (<20 keys):');
report.filter(f => f.keyCount < 20).forEach(f => {
  console.log(`  - ${f.filename} (${f.keyCount} keys)`);
});

const totalKeys = report.reduce((sum, f) => sum + f.keyCount, 0);
console.log(`\n═══════════════════════════════════════════`);
console.log(`Total files to translate: ${toTranslate.length}`);
console.log(`Total keys: ${totalKeys}`);
console.log(`For 7 languages: ${totalKeys * 7} translations needed`);
console.log(`═══════════════════════════════════════════\n`);
