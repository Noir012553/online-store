const fs = require('fs');
const path = require('path');

const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');

const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const allActiveLangs = getActiveLangCodes();
const compareLang = allActiveLangs.find(lang => lang !== defaultLang) || allActiveLangs[1];

// Files with consistency issues
const filesWithIssues = [
  'admin-coupons.json',
  'admin-customers.json',
  'admin-import.json',
  'admin-orders.json',
  'admin-users.json',
  'admin.json',
  'products.json'
];

console.log(`\n📋 FINDING MISSING KEYS IN ${defaultLang.toUpperCase()} FILES\n`);

filesWithIssues.forEach((filename) => {
  const defaultPath = path.join(LOCALES_DIR, defaultLang, filename);
  const comparePath = path.join(LOCALES_DIR, compareLang, filename);

  const defaultContent = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  const compareContent = JSON.parse(fs.readFileSync(comparePath, 'utf8'));

  const defaultKeys = Object.keys(defaultContent);
  const compareKeys = Object.keys(compareContent);

  const missingInDefault = compareKeys.filter(key => !defaultKeys.includes(key));

  if (missingInDefault.length > 0) {
    console.log(`\n📄 ${filename} (Missing ${missingInDefault.length} keys in ${defaultLang.toUpperCase()})`);
    console.log(`   Keys to add to ${defaultLang} file:`);

    missingInDefault.forEach(key => {
      const compareValue = compareContent[key];
      console.log(`   "${key}": "${compareValue}",`);
    });
  }
});

console.log(`\n✓ Done!`);
