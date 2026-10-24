const fs = require('fs');
const path = require('path');
const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const defaultLang = getDefaultLanguage().code;
const englishLang = 'en';
const languages = getActiveLangCodes().filter((language) => language !== defaultLang && language !== englishLang);
const localesDir = path.join(__dirname, '../locales');
const defaultDir = path.join(localesDir, defaultLang);
const namespaces = fs.readdirSync(defaultDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace('.json', ''));
const errors = [];
const untranslated = [];
const strict = process.argv.includes('--strict');
let filesChecked = 0;

function collectLeafValues(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? collectLeafValues(child, fullKey)
      : [[fullKey, child]];
  });
}

function isTranslatableValue(value) {
  return typeof value === 'string' && /[A-Za-z]{3}/.test(value) && !/^https?:\/\//.test(value);
}

console.log(`\n${CLI_SYMBOLS.search} Verifying ${languages.length} non-English languages against ${namespaces.length} namespace files...`);
console.log(`${CLI_SYMBOLS.openFolder} Scanning: ${languages.join(', ')}\n`);

for (const language of languages) {
  for (const namespace of namespaces) {
    const localizedPath = path.join(localesDir, language, `${namespace}.json`);
    const englishPath = path.join(localesDir, englishLang, `${namespace}.json`);

    if (!fs.existsSync(localizedPath)) {
      errors.push(`${language}/${namespace}.json is missing`);
      continue;
    }

    if (!fs.existsSync(englishPath)) {
      errors.push(`${englishLang}/${namespace}.json is missing`);
      continue;
    }

    filesChecked += 1;

    try {
      const englishValues = new Map(collectLeafValues(JSON.parse(fs.readFileSync(englishPath, 'utf8'))));
      const localizedValues = collectLeafValues(JSON.parse(fs.readFileSync(localizedPath, 'utf8')));

      for (const [key, value] of localizedValues) {
        if (isTranslatableValue(value) && value === englishValues.get(key)) {
          untranslated.push({ language, namespace, key });
        }
      }
    } catch (error) {
      errors.push(`${language}/${namespace}.json - ${error.message}`);
    }
  }
}

console.log(`\n${CLI_SYMBOLS.chart} VERIFICATION RESULTS`);
console.log(CLI_SYMBOLS.heavyDivider.repeat(31));
console.log(`Files checked: ${filesChecked}/${languages.length * namespaces.length}`);
console.log(`File errors: ${errors.length}`);
console.log(`Potential untranslated values: ${untranslated.length}`);

if (untranslated.length > 0) {
  const samplesByLocale = untranslated.reduce((samples, entry) => {
    const localeSamples = samples.get(entry.language) || [];
    if (localeSamples.length < 10) localeSamples.push(`${entry.namespace}.json:${entry.key}`);
    samples.set(entry.language, localeSamples);
    return samples;
  }, new Map());

  console.log(`\n${CLI_SYMBOLS.warning} Potential English fallback values detected:`);
  for (const [language, samples] of samplesByLocale) {
    console.log(`- ${language}: ${samples.join(', ')}`);
  }
}

if (errors.length > 0 || (strict && untranslated.length > 0)) {
  console.log(`\n${CLI_SYMBOLS.error} VERIFICATION FAILED`);
  errors.forEach((error) => console.log(`${CLI_SYMBOLS.error} ${error}`));
  process.exit(1);
}

console.log(`\n${CLI_SYMBOLS.success} VERIFICATION PASSED${untranslated.length > 0 ? ' with translation audit warnings' : ''}.`);
