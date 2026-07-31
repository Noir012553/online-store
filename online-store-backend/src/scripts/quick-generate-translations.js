const fs = require('fs');
const path = require('path');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');

const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const DEFAULT_DIR = path.join(LOCALES_DIR, defaultLang);

const FILES_TO_TRANSLATE = [
  'admin-common.json', 'admin-coupons.json', 'admin-customers.json',
  'checkout.json', 'common.json', 'products.json',
  'admin-banners.json', 'admin-errors.json', 'admin-export.json',
  'admin-i18n-monitoring.json', 'admin-import.json', 'admin-notifications.json',
  'admin-translation-batch.json', 'admin-translation-override.json',
  'admin-translation.json', 'api-errors.json', 'auth-messages.json', 'cart.json',
  'categories.json', 'coupons.json', 'customers.json', 'errors.json',
  'about.json', 'banner.json', 'breadcrumbs.json', 'contact.json', 'export.json',
  'footer.json', 'frontend-error-handler.json', 'frontend-errors.json',
  'frontend-import.json', 'import.json', 'login.json', 'newsletter.json',
  'notifications.json', 'order-confirmation.json', 'order-success.json', 'pages.json',
  'pagination.json', 'payment-messages.json', 'payment.json', 'policies.json',
  'productsTranslations.json', 'profile.json', 'shipping-messages.json',
  'shopping-guide.json', 'statistics.json', 'testimonial.json',
  'translation-messages.json', 'ui-common.json', 'ui-loading.json', 'user-messages.json'
];

const allActiveLangs = getActiveLangCodes();
const LANGS = allActiveLangs.filter(l => l !== defaultLang);

function main() {
  console.log(`${CLI_SYMBOLS.chart} Checking translation file structure...\n`);

  let total = 0;
  let exists = 0;
  let missing = 0;

  for (const lang of LANGS) {
    const langDir = path.join(LOCALES_DIR, lang);
    
    for (const file of FILES_TO_TRANSLATE) {
      const targetFile = path.join(langDir, file);
      total++;
      
      if (fs.existsSync(targetFile)) {
        exists++;
      } else {
        missing++;
        console.log(`Missing: ${lang}/${file}`);
      }
    }
  }

  console.log(`\nStatistics:`);
  console.log(`Total Expected: ${total}`);
  console.log(`Exist: ${exists}`);
  console.log(`Missing: ${missing}`);
}

main();
