/**
 * Out-of-Stock Product Seeder
 * Thêm 1 sản phẩm hết hàng (countInStock = 0) cho mỗi danh mục
 * Để test hiển thị trạng thái "Hết hàng" trong admin
 */

const Product = require('../models/Product');
const { getMessage } = require('../i18n/messages');
const { getActiveLangCodes } = require('../config/languageInventory');

const SUPPORTED_LANGS = getActiveLangCodes();

const CATEGORY_KEYS = [
  'out_of_stock_category_keyboard',
  'out_of_stock_category_mouse',
  'out_of_stock_category_headphones',
  'out_of_stock_category_cooling',
  'out_of_stock_category_gaming_laptop',
  'out_of_stock_category_office_laptop',
];

const buildProductName = (categoryKey) => {
  const name = {};
  SUPPORTED_LANGS.forEach(lang => {
    const prefix = getMessage(lang, 'product-seeder-messages.out_of_stock_prefix');
    const sample = getMessage(lang, 'product-seeder-messages.out_of_stock_sample_product');
    const categoryLabel = getMessage(lang, 'product-seeder-messages.out_of_stock_category_label');
    const categoryName = getMessage(lang, `product-seeder-messages.${categoryKey}`);
    name[lang] = `${prefix} ${sample} - ${categoryName}`;
  });
  return name;
};

const buildProductDescription = (categoryKey) => {
  const desc = {};
  SUPPORTED_LANGS.forEach(lang => {
    const categoryName = getMessage(lang, `product-seeder-messages.${categoryKey}`);
    const descTemplate = getMessage(lang, 'product-seeder-messages.out_of_stock_description');
    desc[lang] = descTemplate.replace('{{category}}', categoryName);
  });
  return desc;
};

const buildProductFeatures = () => {
  const features = {};
  SUPPORTED_LANGS.forEach(lang => {
    features[lang] = [
      getMessage(lang, 'product-seeder-messages.out_of_stock_feature'),
      getMessage(lang, 'product-seeder-messages.out_of_stock_feature_pending'),
    ];
  });
  return features;
};

const seedOutOfStockProducts = async (userId, categoryIds, supplierIds) => {
  try {
    const { getDefaultLanguage } = require('../config/languageInventory');
    const defaultLang = getDefaultLanguage().code;

    const outOfStockProducts = [];
    const brandName = {};
    SUPPORTED_LANGS.forEach(lang => {
      brandName[lang] = getMessage(lang, 'product-seeder-messages.test_brand_name');
    });

    for (let i = 0; i < categoryIds.length && i < CATEGORY_KEYS.length; i++) {
      const imageUrl = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400';
      const categoryKey = CATEGORY_KEYS[i];

      // Dynamic fallback chain - not hardcoded to 'en'
      let brand = brandName[defaultLang];
      if (!brand) {
        const fallbackChain = [defaultLang, ...SUPPORTED_LANGS.filter(l => l !== defaultLang)];
        for (const lang of fallbackChain) {
          if (brandName[lang]) {
            brand = brandName[lang];
            break;
          }
        }
      }

      const productData = {
        user: userId,
        name: buildProductName(categoryKey),
        brand: brand,
        category: categoryIds[i],
        supplier: supplierIds[i % supplierIds.length],
        image: imageUrl,
        images: [imageUrl],
        price: 1000000 + i * 100000,
        originalPrice: 1500000 + i * 100000,
        countInStock: 0,
        description: buildProductDescription(categoryKey),
        rating: 4.5,
        numReviews: Math.floor(Math.random() * 50),
        featured: false,
        specs: {
          example: 'out-of-stock test'
        },
        features: buildProductFeatures(),
      };

      outOfStockProducts.push(productData);
    }

    const createdProducts = await Product.create(outOfStockProducts);

    return createdProducts;
  } catch (error) {
    throw error;
  }
};

module.exports = seedOutOfStockProducts;
