#!/usr/bin/env node

/**
 * Batch translation script for JSON files to all non-default languages
 * Uses Google Generative AI (Gemini)
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDefaultLanguage, getActiveLangCodes, getLanguageNames } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const DEFAULT_DIR = path.join(LOCALES_DIR, defaultLang);

// Get language names dynamically from config (not hardcoded)
const LANG_NAMES = getLanguageNames();

const allActiveLangs = getActiveLangCodes();
const TARGET_LANGS_CODES = allActiveLangs.filter(l => l !== defaultLang);
const TARGET_LANGS = TARGET_LANGS_CODES.reduce((acc, code) => {
  acc[code] = LANG_NAMES[code] || code;
  return acc;
}, {});

const HIGH_PRIORITY = [
  'admin-common.json',
  'admin-coupons.json',
  'admin-customers.json',
  'checkout.json',
  'common.json',
  'products.json'
];

const MEDIUM_PRIORITY = [
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

const LOW_PRIORITY = [
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

let genAI = null;
let apiKeyAvailable = false;

function initializeAPI() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn(`${CLI_SYMBOLS.warning}  GEMINI_API_KEY not found in environment. Using demo mode with placeholder translations.`);
    return false;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  apiKeyAvailable = true;
  return true;
}

async function translateWithAI(jsonObject, targetLang, langName, filename) {
  if (!apiKeyAvailable || !genAI) return null;

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are a professional translator. Translate the following JSON object from English to ${langName}.

CRITICAL RULES:
1. Return ONLY valid JSON format
2. Keep ALL keys exactly the same
3. Translate ONLY the VALUES
4. PRESERVE all placeholders: {{variable}}, {variable}, {count}, {status}, {amount}, {days}, {code}, {provider}, {query}
5. PRESERVE URLs, emails, and brand names like "LaptopStore", "LT", "VNPAY"
6. PRESERVE special characters, numbers, currency symbols (VND, ₫)
7. Keep punctuation and formatting identical

Return ONLY the JSON object, no markdown, no explanations.

JSON to translate:
${JSON.stringify(jsonObject, null, 2)}`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Extract JSON from response
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const translatedJSON = JSON.parse(jsonStr);
    return translatedJSON;
  } catch (error) {
    console.error(`   ${CLI_SYMBOLS.error} Error translating ${filename} to ${langName}:`, error.message);
    return null;
  }
}

function createPlaceholderTranslation(jsonObject, targetLang) {
  // Simple placeholder approach - useful for testing structure
  const placeholders = {
    it: '[IT] ',
    es: '[ES] ',
    nl: '[NL] ',
    sv: '[SV] ',
  };

  const result = {};
  for (const [key, value] of Object.entries(jsonObject)) {
    if (typeof value === 'string') {
      result[key] = placeholders[targetLang] + value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function translateFile(filename, priority) {
  const enFilePath = path.join(EN_DIR, filename);

  if (!fs.existsSync(enFilePath)) {
    console.log(`   ${CLI_SYMBOLS.error} File not found: ${filename}`);
    return false;
  }

  const enContent = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));
  console.log(`\n${CLI_SYMBOLS.report} Processing [${priority}] ${filename}`);

  let allSuccess = true;

  for (const [langCode, langName] of Object.entries(TARGET_LANGS)) {
    const targetDir = path.join(LOCALES_DIR, langCode);
    const targetFilePath = path.join(targetDir, filename);

    // Create directory if not exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    process.stdout.write(`   ${CLI_SYMBOLS.arrowRight} ${langCode.toUpperCase()} (${langName})... `);

    let translatedContent = null;

    // Try AI translation first
    if (apiKeyAvailable) {
      translatedContent = await translateWithAI(enContent, langCode, langName, filename);
      if (translatedContent) {
        console.log(CLI_SYMBOLS.check);
      }
    }

    // Fallback to placeholder if no API or AI failed
    if (!translatedContent) {
      if (apiKeyAvailable) {
        console.log('(fallback placeholder)');
      } else {
        process.stdout.write('(placeholder)');
      }
      translatedContent = createPlaceholderTranslation(enContent, langCode);
      if (!apiKeyAvailable) {
        console.log('');
      }
    }

    // Write the file
    try {
      fs.writeFileSync(targetFilePath, JSON.stringify(translatedContent, null, 2) + '\n', 'utf8');
    } catch (error) {
      console.error(`\n   ${CLI_SYMBOLS.error} Error writing ${targetFilePath}:`, error.message);
      allSuccess = false;
    }

    // Rate limiting
    if (apiKeyAvailable) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return allSuccess;
}

async function main() {
  const hasAPI = initializeAPI();
  
  console.log(`${CLI_SYMBOLS.boxTopLeft}${CLI_SYMBOLS.divider.repeat(56)}${CLI_SYMBOLS.boxTopRight}`);
  console.log(`${CLI_SYMBOLS.boxVertical}  ${CLI_SYMBOLS.books} JSON Locale Batch Translation (EN ${CLI_SYMBOLS.arrowRight} IT, ES, NL, SV) ${CLI_SYMBOLS.boxVertical}`);
  console.log(`${CLI_SYMBOLS.boxBottomLeft}${CLI_SYMBOLS.divider.repeat(56)}${CLI_SYMBOLS.boxBottomRight}\n`);

  const totalFiles = HIGH_PRIORITY.length + MEDIUM_PRIORITY.length + LOW_PRIORITY.length;
  console.log(`${CLI_SYMBOLS.chart} Configuration:`);
  console.log(`   ${CLI_SYMBOLS.bullet} HIGH Priority: ${HIGH_PRIORITY.length} files`);
  console.log(`   ${CLI_SYMBOLS.bullet} MEDIUM Priority: ${MEDIUM_PRIORITY.length} files`);
  console.log(`   ${CLI_SYMBOLS.bullet} LOW Priority: ${LOW_PRIORITY.length} files`);
  console.log(`   ${CLI_SYMBOLS.bullet} Total: ${totalFiles} files`);
  console.log(`   ${CLI_SYMBOLS.bullet} Target Languages: ${Object.values(TARGET_LANGS).join(', ')}`);
  console.log(`   ${CLI_SYMBOLS.bullet} API Available: ${hasAPI ? `${CLI_SYMBOLS.check} Yes (Gemini)` : `${CLI_SYMBOLS.cross} No (using placeholders)`}\n`);

  if (!hasAPI) {
    console.log(`${CLI_SYMBOLS.warning}  NOTE: No API key found. Generating placeholder translations for structure testing.`);
    console.log('   For production, set GEMINI_API_KEY environment variable.\n');
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // HIGH PRIORITY
  console.log(CLI_SYMBOLS.divider.repeat(59));
  console.log(`${CLI_SYMBOLS.importanceCritical} HIGH PRIORITY FILES`);
  console.log(CLI_SYMBOLS.divider.repeat(59));
  for (const file of HIGH_PRIORITY) {
    const success = await translateFile(file, 'HIGH');
    processed++;
    if (success) succeeded++;
    else failed++;
  }

  // MEDIUM PRIORITY
  console.log(`\n${CLI_SYMBOLS.divider.repeat(59)}`);
  console.log(`${CLI_SYMBOLS.importanceMedium} MEDIUM PRIORITY FILES`);
  console.log(CLI_SYMBOLS.divider.repeat(59));
  for (const file of MEDIUM_PRIORITY) {
    const success = await translateFile(file, 'MEDIUM');
    processed++;
    if (success) succeeded++;
    else failed++;
  }

  // LOW PRIORITY
  console.log(`\n${CLI_SYMBOLS.divider.repeat(59)}`);
  console.log(`${CLI_SYMBOLS.importanceLow} LOW PRIORITY FILES`);
  console.log(CLI_SYMBOLS.divider.repeat(59));
  for (const file of LOW_PRIORITY) {
    const success = await translateFile(file, 'LOW');
    processed++;
    if (success) succeeded++;
    else failed++;
  }

  // Summary
  console.log(`\n${CLI_SYMBOLS.divider.repeat(59)}`);
  console.log(`${CLI_SYMBOLS.chart} TRANSLATION SUMMARY`);
  console.log(CLI_SYMBOLS.divider.repeat(59));
  console.log(`${CLI_SYMBOLS.check} Files Successfully Processed: ${succeeded}`);
  console.log(`${CLI_SYMBOLS.cross} Files with Errors: ${failed}`);
  console.log(`${CLI_SYMBOLS.folder} Total Files Processed: ${processed}`);
  console.log(`${CLI_SYMBOLS.globe} Total Translation Files Created: ${processed * 4}`);
  
  if (!hasAPI) {
    console.log(`\n${CLI_SYMBOLS.warning}  IMPORTANT: These are PLACEHOLDER translations!`);
    console.log(`   They have the correct structure but contain "[IT]/[ES]/[NL]/[SV]" prefixes.`);
    console.log(`   To generate real translations, set the GEMINI_API_KEY environment variable.`);
  }
  
  console.log(`\n${CLI_SYMBOLS.celebration} Translation batch complete!\n`);
}

main().catch(console.error);
