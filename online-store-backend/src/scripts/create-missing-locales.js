const fs = require('fs');
const path = require('path');

const { getDefaultLanguage, getActiveLangCodes } = require('./src/config/languageInventory');

const LOCALES_PATH = path.join(__dirname, 'src/locales');
const SUPPORTED_LANGUAGES = getActiveLangCodes();
const SOURCE_LANGUAGE = getDefaultLanguage().code;

function getAvailableNamespaces() {
  const sourcePath = path.join(LOCALES_PATH, SOURCE_LANGUAGE);
  
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source language folder not found: ${sourcePath}`);
    return [];
  }

  try {
    const files = fs.readdirSync(sourcePath);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  } catch (error) {
    console.error(`Error reading namespaces: ${error.message}`);
    return [];
  }
}

const namespaces = getAvailableNamespaces();

console.log(`Found ${namespaces.length} namespaces to copy`);
console.log(`Creating locales for: ${SUPPORTED_LANGUAGES.join(', ')}`);

let totalCreated = 0;

for (const lang of SUPPORTED_LANGUAGES) {
  const langPath = path.join(LOCALES_PATH, lang);
  
  // Create language directory if not exists
  if (!fs.existsSync(langPath)) {
    fs.mkdirSync(langPath, { recursive: true });
    console.log(`✓ Created directory: ${lang}/`);
  }

  for (const namespace of namespaces) {
    const sourcePath = path.join(LOCALES_PATH, SOURCE_LANGUAGE, `${namespace}.json`);
    const targetPath = path.join(langPath, `${namespace}.json`);

    // Skip if already exists
    if (fs.existsSync(targetPath)) {
      console.log(`  - ${lang}/${namespace}.json already exists`);
      continue;
    }

    try {
      // Read source file
      const content = fs.readFileSync(sourcePath, 'utf-8');
      const translations = JSON.parse(content);

      // Write to target with same structure
      fs.writeFileSync(
        targetPath,
        JSON.stringify(translations, null, 2) + '\n'
      );

      console.log(`  ✓ ${lang}/${namespace}.json`);
      totalCreated++;
    } catch (error) {
      console.error(`  ✗ Error copying ${namespace} to ${lang}: ${error.message}`);
    }
  }
}

console.log(`\n✅ Created ${totalCreated} new locale files`);
console.log('\nNext steps:');
console.log('1. Review the seeder in seeds/translationSeeder.js');
console.log('2. Update SUPPORTED_LANGUAGES in translationSeeder.js to include all 9 languages');
console.log('3. Run: npm run seed');
