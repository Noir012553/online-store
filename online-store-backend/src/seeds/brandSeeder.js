const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { getMessage } = require('../i18n/messages');

const normalizeBrandName = value => String(value || '').trim().replace(/\s+/g, ' ');

const createBrandKey = name => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const getImportedBrands = async () => {
  const names = await Product.distinct('brand', { isDeleted: false });
  const brands = new Map();

  names.forEach(value => {
    const name = normalizeBrandName(value);
    const key = createBrandKey(name);
    if (name && key && !brands.has(key)) {
      brands.set(key, { name, key });
    }
  });

  return [...brands.values()];
};

const seedBrands = async () => {
  try {
    const brandsData = await getImportedBrands();

    if (brandsData.length > 0) {
      await Brand.bulkWrite(brandsData.map(brand => ({
        updateOne: {
          filter: { key: brand.key },
          update: {
            $set: {
              name: brand.name,
              isDeleted: false,
            },
            $setOnInsert: {
              key: brand.key,
            },
          },
          upsert: true,
        },
      })));
    }

    return Brand.find({ isDeleted: false });
  } catch (error) {
    const { getDefaultLanguage } = require('../config/languageInventory');
    const seedLang = getDefaultLanguage().code.toUpperCase();
    console.error(getMessage(seedLang, 'seeder-messages.brand_seeding_error', {
      error: error.message
    }));
    throw error;
  }
};

module.exports = seedBrands;
