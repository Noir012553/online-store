/**
 * Database Seeder - Khởi tạo nhà vận chuyển
 * Seed GHN (Giao Hàng Nhanh) từ environment variables
 */

const ShippingProvider = require('../models/ShippingProvider');
const { getMessage } = require('../i18n/messages');
const { getActiveLangCodes } = require('../config/languageInventory');

const SUPPORTED_LANGS = getActiveLangCodes();

const seedShippingProviders = async () => {
  const ghnToken = process.env.GHN_API_TOKEN || process.env.GHN_TOKEN;

  if (!ghnToken) {
    console.warn(
      '⚠️ GHN_API_TOKEN not found in .env file. Skipping GHN seeding.\n' +
      '   Please add GHN_API_TOKEN to your .env file to enable shipping integration.'
    );
    return [];
  }

  const existingGhn = await ShippingProvider.findOne({ code: 'ghn', isDeleted: false });

  if (existingGhn) {
    if (existingGhn.currencyCode !== 'VND') {
      existingGhn.currencyCode = 'VND';
      await existingGhn.save();
    }
    console.log(`ℹ️  GHN provider already configured. Skipping creation.`);
    return [existingGhn];
  }

  const buildServiceName = (code) => {
    const keyMap = {
      standard: 'ghn_standard_service',
      fast: 'ghn_fast_service',
      express: 'ghn_express_service',
    };
    const key = keyMap[code];
    const name = {};
    SUPPORTED_LANGS.forEach(lang => {
      name[lang] = getMessage(lang, `shipping-providers-seed.${key}`);
    });
    return name;
  };

  const ghnDescription = {};
  SUPPORTED_LANGS.forEach(lang => {
    ghnDescription[lang] = getMessage(lang, 'shipping-providers-seed.ghn_provider_description');
  });

  const { getDefaultLanguage } = require('../config/languageInventory');
  const defaultLang = getDefaultLanguage().code;

  // Dynamic fallback chain - not hardcoded to 'en'
  let description = ghnDescription[defaultLang];
  if (!description) {
    const fallbackChain = [defaultLang, ...SUPPORTED_LANGS.filter(l => l !== defaultLang)];
    for (const lang of fallbackChain) {
      if (ghnDescription[lang]) {
        description = ghnDescription[lang];
        break;
      }
    }
  }

  const ghnProvider = new ShippingProvider({
    name: 'GHN',
    code: 'ghn',
    logo: 'https://www.ghnsmart.com/favicon.ico',
    description: description,
    descriptions: ghnDescription,
    apiUrl: 'https://api.ghn.vn/v2',
    apiKey: ghnToken,
    currencyCode: 'VND',
    serviceTypes: [
      {
        code: 'standard',
        name: buildServiceName('standard'),
        estimatedDays: '2-3',
      },
      {
        code: 'fast',
        name: buildServiceName('fast'),
        estimatedDays: '1-2',
      },
      {
        code: 'express',
        name: buildServiceName('express'),
        estimatedDays: '1-3',
      },
    ],
    isActive: true,
  });

  const createdProviders = [];

  try {
    const savedGhn = await ghnProvider.save();
    createdProviders.push(savedGhn);
    console.log(`🚚 ✅ Successfully created GHN shipping provider`);
  } catch (error) {
    console.error(`❌ Failed to create GHN provider: ${error.message}`);
  }

  return createdProviders;
};

module.exports = seedShippingProviders;
