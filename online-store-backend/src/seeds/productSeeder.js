/**
 * Database Seeder - Fetch sản phẩm từ 6 collections của Gearvn
 * Lấy dữ liệu đa dạng: Bàn phím, Chuột, Tai nghe, Tản nhiệt, Laptop Gaming, Laptop Văn phòng
 * Dịch sang Tiếng Anh (Gearvn source luôn là Tiếng Việt)
 */

const Product = require('../models/Product');
const { normalizeSpecs } = require('../utils/specNormalizer');
const translationSeederHelper = require('../services/translationSeederHelper');

/**
 * Định nghĩa các collection của Gearvn
 * Map: collection index → (category index, URL)
 */
const GEARVN_COLLECTIONS = [
  {
    categoryIndex: 0, // Bàn phím
    url: 'https://gearvn.com/collections/ban-phim-may-tinh/products.json',
    name: 'Bàn phím'
  },
  {
    categoryIndex: 1, // Chuột
    url: 'https://gearvn.com/collections/chuot-may-tinh/products.json',
    name: 'Chuột'
  },
  {
    categoryIndex: 2, // Tai nghe
    url: 'https://gearvn.com/collections/tai-nghe-may-tinh/products.json',
    name: 'Tai nghe'
  },
  {
    categoryIndex: 3, // Tản nhiệt
    url: 'https://gearvn.com/collections/tan-nhiet-may-tinh/products.json',
    name: 'Tản nhiệt'
  },
  {
    categoryIndex: 4, // Laptop Gaming
    url: 'https://gearvn.com/collections/laptop-gaming-ban-chay/products.json',
    name: 'Laptop Gaming'
  },
  {
    categoryIndex: 5, // Laptop Văn phòng
    url: 'https://gearvn.com/collections/laptop-van-phong-ban-chay/products.json',
    name: 'Laptop Văn phòng'
  }
];

/**
 * Decode HTML entities (&#160; → space, &nbsp; → space, &#123; → {, etc)
 * @param {String} text - Text có HTML entities
 * @returns {String} Decoded text
 */
const decodeHtmlEntities = (text) => {
  if (!text) return text;

  const htmlMap = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&amp;': '&',
    '&#160;': ' ',
    '&#39;': "'",
  };

  let decoded = text;
  Object.entries(htmlMap).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  });

  // Decode numeric entities (&#123; → {, &#8220; → ")
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
};

/**
 * Strip HTML tags và decode entities từ text
 * @param {String} html - HTML text
 * @returns {String} Cleaned text
 */
const cleanHtmlContent = (html) => {
  if (!html) return '';

  let text = html
    // Remove script & style tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Clean multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Decode entities
  text = decodeHtmlEntities(text);

  return text;
};

/**
 * Chuẩn hóa giá trị spec theo loại spec field (Normalize units per spec type)
 * @param {String} value - Giá trị spec (ví dụ: "1.5kg", "95 giờ")
 * @param {String} specField - Tên spec field (ví dụ: "weight", "battery")
 * @returns {String} Giá trị chuẩn hóa với unit chính
 */
const normalizeSpecValue = (value, specField) => {
  if (!value || typeof value !== 'string') return value;

  const lowerValue = value.toLowerCase().trim();

  // Weight: Normalize to grams (g)
  if (specField === 'weight') {
    let kgMatch = lowerValue.match(/^([\d.,]+)\s*(?:kg|k\b|kilogram)/i);
    if (kgMatch) {
      const kg = parseFloat(kgMatch[1].replace(/,/g, '.'));
      return Math.round(kg * 1000) + 'g';
    }

    let gMatch = lowerValue.match(/^([\d.,]+)\s*(?:g\b|gram)/i);
    if (gMatch) {
      return Math.round(parseFloat(gMatch[1].replace(/,/g, '.'))) + 'g';
    }
  }

  // Battery: Normalize
  if (specField === 'battery') {
    let cleanValue = lowerValue
      .replace(/g\s*\(\s*i?ờ[n]?g?\s*\)/gi, 'giờ')
      .replace(/t\s*\(\s*i?ế[n]?ng\s*\)/gi, 'giờ')
      .replace(/ti\s*\(\s*ế[n]?ng\s*\)/gi, 'giờ')
      .replace(/tiếng/gi, 'giờ')
      .trim();

    let timeMatch = cleanValue.match(/^([\d.,]+)\s*(?:h\b|hour|hours|giờ)/i);
    if (timeMatch && timeMatch[1]) {
      return parseInt(parseFloat(timeMatch[1].replace(/,/g, '.'))) + ' giờ';
    }

    let energyMatch = cleanValue.match(/^([\d.,]+)\s*(?:mah|wh|ah|ma?h)\b/i);
    if (energyMatch && energyMatch[1]) {
      const value = parseFloat(energyMatch[1].replace(/,/g, '.'));
      if (cleanValue.match(/mah\b/i)) {
        return Math.round(value) + ' mAh';
      } else if (cleanValue.match(/wh\b/i)) {
        return Math.round(value) + ' Wh';
      }
    }
  }

  return value;
};

/**
 * Extract features từ description text
 * Trả về các tags để hiển thị trên Product Description tab
 */
const extractFeatures = (description = '') => {
  const features = [];

  // Các tính năng cơ bản (always included)
  features.push('Thương hiệu chính hãng');
  features.push('Bảo hành chính hãng 24 tháng');
  features.push('Hỗ trợ đổi mới trong 7 ngày');
  features.push('Giao hàng nhanh chóng');
  features.push('Hỗ trợ khách hàng 24/7');

  if (!description) return features;

  const descLower = description.toLowerCase();
  const featureKeywords = {
    'kết nối không dây|wireless|2\\.?4ghz|bluetooth': 'Kết nối không dây tiên lợi',
    'rgb|led|đèn|light|backlit|backlight': 'Đèn RGB/Nền có thể',
    'chống nước|waterproof|chống bụi': 'Chống nước chống bụi',
    'pin|battery|thời lượng pin|endurance': 'Thời lượng pin lâu',
    'gọn gàng|compact|mini|nhẹ|lightweight': 'Thiết kế gọn gàng nhe',
    'mechanical|cơ học|switch|cherry|mech': 'Bàn phím cơ cao cấp',
    'gaming|game|chơi game|esports|fps|fps': 'Tối ưu cho gaming',
    'business|văn phòng|office|productivity': 'Phù hợp dùng văn phòng',
    'high dpi|cảm biến|sensor|tracking|precision': 'Cảm biến độ chính xác cao',
    'ergonomic|êm ái|thoải mái|comfortable': 'Thiết kế ergonomic thoải mái',
    'programmable|custom|công cụ mạnh|macro|customizable': 'Lập trình nút tùy chỉnh',
    'hiệu năng|performance|speed|fast|powerful': 'Hiệu năng cao',
    'chất lượng âm|audio|sound|bass|stereo': 'Chất lượng âm tuyệt vời',
    'kết nối ổn định|stable|connection|sync': 'Kết nối ổn định',
  };

  Object.entries(featureKeywords).forEach(([keywords, feature]) => {
    const regex = new RegExp(keywords, 'i');
    if (regex.test(descLower) && !features.includes(feature)) {
      features.push(feature);
    }
  });

  return features.slice(0, 12); // Tối đa 12 features
};

/**
 * Smart field name normalization
 */
const smartNormalizeFieldName = (fieldName) => {
  if (!fieldName) return fieldName;
  const normalized = fieldName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');
  const fieldPatterns = {
    'connection': /kết.*nối|wireless|wired|bluetooth/,
    'weight': /trọng.*lương|weight/,
    'battery': /pin|battery/,
    'sensor': /cảm.*biến|sensor/,
    'cpu': /cpu|processor|vi.*xử.*lý/,
    'ram': /ram|bộ.*nhớ/,
    'storage': /storage|ổ.*cứng/,
    'display': /display|màn.*hình/,
    'gpu': /gpu|card.*đồ.*họa/,
  };

  for (const [fieldKey, pattern] of Object.entries(fieldPatterns)) {
    if (pattern.test(normalized)) return fieldKey;
  }
  return normalized;
};

/**
 * Parse specs từ tags
 */
const parseSpecsFromTags = (tags) => {
  if (!tags || (Array.isArray(tags) && tags.length === 0)) return {};
  const specs = {};
  let tagArray = Array.isArray(tags) ? tags : (tags || '').split(',');

  tagArray.forEach(tag => {
    if (!tag || typeof tag !== 'string') return;
    const trimmedTag = tag.trim();
    if (trimmedTag.startsWith('spec_')) {
      const colonIndex = trimmedTag.indexOf(':');
      if (colonIndex > 0) {
        let fieldName = trimmedTag.substring(5, colonIndex).trim();
        let fieldValue = trimmedTag.substring(colonIndex + 1).trim();
        const key = smartNormalizeFieldName(fieldName);
        if (fieldValue) specs[key] = fieldValue;
      }
    }
  });
  return specs;
};

/**
 * Normalize toàn bộ specs object
 */
const normalizeAllSpecs = (specs) => {
  if (!specs || typeof specs !== 'object') return {};
  const normalized = {};
  const specFields = ['weight', 'battery', 'ram', 'storage', 'display'];

  Object.entries(specs).forEach(([key, value]) => {
    if (!value) return;
    normalized[key] = specFields.includes(key) ? normalizeSpecValue(value.toString(), key) : value.toString();
  });
  return normalized;
};

/**
 * Extract specs từ description
 */
const extractSpecsFromDescription = (description = '', productTitle = '') => {
  const specs = {};
  const fullText = (productTitle + ' ' + description).toLowerCase();
  
  if (/intel|amd|ryzen|core/i.test(fullText)) {
    const cpuMatch = fullText.match(/intel\s+core\s+i[3579]|amd\s+ryzen\s+[357]/i);
    if (cpuMatch) specs.cpu = cpuMatch[0];
  }
  
  const ramMatch = fullText.match(/(\d+)\s*gb\s*ram/i);
  if (ramMatch) specs.ram = ramMatch[1] + ' GB';

  return specs;
};

/**
 * Fetch sản phẩm từ URL Gearvn
 */
const fetchGearvnProducts = async (url, limit = 20) => {
  try {
    const fullUrl = `${url}?limit=${limit}`;
    const response = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const data = await response.json();
    return data.products || [];
  } catch (error) {
    return [];
  }
};

/**
 * Map gearvn product data vào Product model
 */
const mapGearvnToProduct = async (gearvnProduct, userId, categoryId, supplierId) => {
  const variant = gearvnProduct.variants?.[0];
  const mainImage = gearvnProduct.image?.src || gearvnProduct.images?.[0]?.src;
  let allImages = (gearvnProduct.images || []).map(img => img.src).filter(Boolean);
  if (allImages.length === 0 && mainImage) allImages = [mainImage];

  const price = parseInt(variant?.price || 0);
  const originalPrice = parseInt(variant?.compare_at_price || 0);
  // Đảm bảo countInStock luôn > 0 (không seed sản phẩm hết hàng)
  const countInStock = Math.max(variant?.inventory_quantity || 5, Math.floor(Math.random() * 50 + 10));

  let rawDescription = gearvnProduct.body_html || '';
  const cleanDescription = cleanHtmlContent(rawDescription);
  let specs = parseSpecsFromTags(gearvnProduct.tags);
  if (Object.keys(specs).length < 2) {
    specs = { ...extractSpecsFromDescription(cleanDescription, gearvnProduct.title), ...specs };
  }
  specs = normalizeSpecs(normalizeAllSpecs(specs));
  const features = extractFeatures(cleanDescription);
  const description = '';
  const brand = gearvnProduct.vendor || 'Unknown Brand';

  return {
    user: userId,
    name: gearvnProduct.title,
    image: mainImage || allImages[0],
    images: allImages,
    brand: brand,
    category: categoryId,
    supplier: supplierId,
    description: description,
    specs: specs,
    features: features,
    rating: 4.5 + Math.random() * 0.5,
    numReviews: Math.floor(Math.random() * 100 + 20),
    price: price,
    originalPrice: originalPrice > price ? originalPrice : undefined,
    countInStock: countInStock,
    featured: Math.random() > 0.6,
    deal: (originalPrice > price) ? {
      discount: Math.round(((originalPrice - price) / originalPrice) * 100),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    } : {},
  };
};

/**
 * Seed dữ liệu sản phẩm
 */
const seedProducts = async (userId, categoryIds, supplierIds) => {
  try {
    await Product.deleteMany({});
    const allProducts = [];

    for (const collection of GEARVN_COLLECTIONS) {
      const productsFromCollection = await fetchGearvnProducts(collection.url, 20);

      console.log(`[Seeder] Processing ${productsFromCollection.length} products for ${collection.name}...`);

      // Xử lý từng sản phẩm
      for (let i = 0; i < productsFromCollection.length; i++) {
        const gearvnProduct = productsFromCollection[i];
        const supplierIndex = i % supplierIds.length;
        const categoryId = categoryIds[collection.categoryIndex];

        const mappedProduct = await mapGearvnToProduct(
          gearvnProduct,
          userId,
          categoryId,
          supplierIds[supplierIndex]
        );

        allProducts.push(mappedProduct);
      }
    }


    try {
      const createdProducts = await Product.create(allProducts);

      // Tầng 2: Translate products to English

      try {
        await translationSeederHelper.translateProductsBatch(createdProducts, ['en']);
      } catch (translationError) {
      }

      return createdProducts;
    } catch (createError) {
      if (createError.name === 'ValidationError') {
        Object.keys(createError.errors).forEach(key => {
          console.error(`[DB_VALIDATION_ERROR] Field "${key}": ${createError.errors[key].message}`);
        });
      }
      throw createError;
    }
  } catch (error) {
    console.error('[Seeder] Error seeding products:', error.message);
    throw error;
  }
};

module.exports = seedProducts;
