const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDefaultLanguage, getActiveLangCodes, getLanguageNames } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get languages dynamically from config (not hardcoded)
const getActiveLanguagesMap = () => {
  const activeLangs = getActiveLangCodes();
  const langNames = getLanguageNames();
  const map = {};
  activeLangs.forEach(lang => {
    map[lang] = langNames[lang];
  });
  return map;
};

const LANGUAGES = getActiveLanguagesMap();

const HIGH_PRIORITY_FILES = [
  'admin-common.json',
  'admin-coupons.json',
  'admin-customers.json',
  'checkout.json',
  'common.json',
  'products.json'
];

const MEDIUM_PRIORITY_FILES = [
  'admin-banners.json',
  'admin-errors.json',
  'admin-export.json',
  'admin-i18n-monitoring.json',
  'admin-import.json',
  'admin-notifications.json',
  'admin-translation-batch.json',
  'admin-translation-override.json',
  'admin-translation.json',
  'api-errors.json',
  'auth-messages.json',
  'cart.json',
  'categories.json',
  'coupons.json',
  'customers.json',
  'errors.json'
];

const LOW_PRIORITY_FILES = [
  'about.json',
  'banner.json',
  'breadcrumbs.json',
  'contact.json',
  'export.json',
  'footer.json',
  'frontend-error-handler.json',
  'frontend-errors.json',
  'frontend-import.json',
  'import.json',
  'login.json',
  'newsletter.json',
  'notifications.json',
  'order-confirmation.json',
  'order-success.json',
  'pages.json',
  'pagination.json',
  'payment-messages.json',
  'payment.json',
  'policies.json',
  'productsTranslations.json',
  'profile.json',
  'shipping-messages.json',
  'shopping-guide.json',
  'statistics.json',
  'testimonial.json',
  'translation-messages.json',
  'ui-common.json',
  'ui-loading.json',
  'user-messages.json'
];

async function translateJSON(jsonObject, targetLanguage, filename) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const keys = Object.keys(jsonObject);
  const values = Object.values(jsonObject);

  const prompt = `You are a professional translator. Translate the following JSON values from English to ${LANGUAGES[targetLanguage]}.

IMPORTANT RULES:
1. Return ONLY valid JSON format
2. Keep the same key names
3. Translate ONLY the values
4. Preserve placeholders like {{variable}}, {variable}, {status}, {code}, {amount}, {count}, {days}, {provider}, {query}
5. Preserve special characters and formatting
6. Keep URLs and code references unchanged
7. For file: ${filename}, ensure consistency with previous translations in the same domain

JSON to translate:
${JSON.stringify(jsonObject, null, 2)}

Return the translated JSON with the same structure and keys.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`Failed to extract JSON for ${filename} -> ${targetLanguage}`);
      return null;
    }

    const translatedJSON = JSON.parse(jsonMatch[0]);
    return translatedJSON;
  } catch (error) {
    console.error(`Error translating ${filename} to ${targetLanguage}:`, error.message);
    return null;
  }
}

async function processFile(filename, priority) {
  const defaultLang = getDefaultLanguage().code;
  const sourceFile = path.join(
    __dirname,
    `../locales/${defaultLang}`,
    filename
  );

  if (!fs.existsSync(sourceFile)) {
    console.log(`${CLI_SYMBOLS.error} File not found: ${filename}`);
    return false;
  }

  const sourceJSON = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  console.log(`\n${CLI_SYMBOLS.report} Processing [${priority}] ${filename}`);

  let allSuccess = true;

  for (const [langCode, langName] of Object.entries(LANGUAGES)) {
    const targetDir = path.join(__dirname, '../locales', langCode);
    const targetFile = path.join(targetDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    process.stdout.write(`  ${CLI_SYMBOLS.arrowRight} Translating to ${langName}...`);

    const translatedJSON = await translateJSON(sourceJSON, langCode, filename);

    if (translatedJSON) {
      fs.writeFileSync(targetFile, JSON.stringify(translatedJSON, null, 2) + '\n');
      console.log(` ${CLI_SYMBOLS.check}`);
    } else {
      console.log(` ${CLI_SYMBOLS.error}`);
      allSuccess = false;
    }

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allSuccess;
}

async function main() {
  console.log(`${CLI_SYMBOLS.rocket} Starting batch translation of locale files`);
  console.log(`${CLI_SYMBOLS.chart} Total files to process: ${HIGH_PRIORITY_FILES.length + MEDIUM_PRIORITY_FILES.length + LOW_PRIORITY_FILES.length}`);
  console.log(`${CLI_SYMBOLS.location} Languages: ${Object.values(LANGUAGES).join(', ')}\n`);

  let processed = 0;
  let failed = 0;

  // Process HIGH priority files
  console.log('========== HIGH PRIORITY ==========');
  for (const file of HIGH_PRIORITY_FILES) {
    const success = await processFile(file, 'HIGH');
    processed++;
    if (!success) failed++;
  }

  // Process MEDIUM priority files
  console.log('\n========== MEDIUM PRIORITY ==========');
  for (const file of MEDIUM_PRIORITY_FILES) {
    const success = await processFile(file, 'MEDIUM');
    processed++;
    if (!success) failed++;
  }

  // Process LOW priority files
  console.log('\n========== LOW PRIORITY ==========');
  for (const file of LOW_PRIORITY_FILES) {
    const success = await processFile(file, 'LOW');
    processed++;
    if (!success) failed++;
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`${CLI_SYMBOLS.check} Files processed: ${processed}`);
  console.log(`${CLI_SYMBOLS.error} Files with errors: ${failed}`);
  console.log(`${CLI_SYMBOLS.celebration} Translation batch complete!`);
}

main().catch(console.error);
