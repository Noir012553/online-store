/**
 * Product Import Validator
 * Validates product data format khi admin import data mới
 * Hỗ trợ: JSON, CSV
 * 
 * Features:
 * - Schema validation cho product fields
 * - Normalize specs format (auto-detect field types)
 * - Detailed error reporting
 * - Data cleanup/transformation
 */

const mongoose = require('mongoose');

/**
 * Required fields khi import products
 */
const REQUIRED_FIELDS = ['name', 'brand', 'price', 'category', 'supplier', 'baseCurrencyCode'];

/**
 * Optional fields có thể có khi import
 */
const OPTIONAL_FIELDS = [
  'productId', 'originalPrice', 'image', 'images', 'countInStock', 'specs',
  'features', 'rating', 'numReviews', 'featured', 'deal'
];


/**
 * Validate 1 product object
 * @param {Object} product - Raw product data từ import
 * @param {Number} rowIndex - Dòng số (for error reporting)
 * @returns {Object} { isValid: boolean, errors: [], warnings: [], cleaned: Object }
 */
function validateProduct(product, rowIndex = 0) {
  const errors = [];
  const warnings = [];
  const cleaned = {};

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = String(product[field] || '').trim();

    if (!value) {
      errors.push(`Row ${rowIndex}: Missing required field "${field}"`);
    } else {
      cleaned[field] = value;
    }
  }

  const baseCurrencyCode = String(product.baseCurrencyCode || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(baseCurrencyCode)) {
    errors.push(`Row ${rowIndex}: baseCurrencyCode must be a valid 3-letter uppercase currency code`);
  } else {
    cleaned.baseCurrencyCode = baseCurrencyCode;
  }

  if (product.productId !== undefined && product.productId !== null && String(product.productId).trim()) {
    const productId = String(product.productId).trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      errors.push(`Row ${rowIndex}: productId must be a valid product ID`);
    } else {
      cleaned.productId = productId;
    }
  }

  // Validate price
  if (product.price) {
    const price = parseFloat(product.price);
    if (isNaN(price) || price <= 0) {
      errors.push(`Row ${rowIndex}: Price must be a number > 0, got: ${product.price}`);
    } else {
      cleaned.price = price;
    }
  }

  // Validate originalPrice nếu có
  if (product.originalPrice) {
    const origPrice = parseFloat(product.originalPrice);
    if (isNaN(origPrice) || origPrice <= 0) {
      warnings.push(`Row ${rowIndex}: Invalid originalPrice, skipped`);
    } else {
      cleaned.originalPrice = origPrice;
      // Check: originalPrice >= price
      if (origPrice < cleaned.price) {
        warnings.push(`Row ${rowIndex}: originalPrice is less than price`);
      }
    }
  }

  // Validate countInStock
  if (product.countInStock) {
    const stock = parseInt(product.countInStock);
    if (isNaN(stock) || stock < 0) {
      warnings.push(`Row ${rowIndex}: Invalid countInStock, defaulting to 0`);
      cleaned.countInStock = 0;
    } else {
      cleaned.countInStock = stock;
    }
  } else {
    cleaned.countInStock = 0;
  }

  // Process specs - can be string or object
  // FIX #6: Validate specs structure
  if (product.specs) {
    try {
      let specsObj;
      if (typeof product.specs === 'string') {
        // Parse JSON string nếu là string
        specsObj = JSON.parse(product.specs);
      } else if (typeof product.specs === 'object') {
        specsObj = product.specs;
      } else {
        throw new Error('Specs must be a JSON object or string');
      }

      // FIX #6: Validate specs is an object with key-value pairs
      if (typeof specsObj !== 'object' || Array.isArray(specsObj)) {
        throw new Error('Specs must be an object, not an array');
      }

      // Normalize spec field names using smartNormalizeFieldName
      cleaned.specs = normalizeSpecNames(specsObj);
    } catch (err) {
      warnings.push(`Row ${rowIndex}: Failed to parse specs, skipped. Error: ${err.message}`);
      cleaned.specs = {};
    }
  } else {
    cleaned.specs = {};
  }

  // Process features - can be array or pipe-separated string
  if (product.features) {
    try {
      if (Array.isArray(product.features)) {
        cleaned.features = product.features.map(f => String(f).trim()).filter(f => f);
      } else if (typeof product.features === 'string') {
        // Parse pipe-separated: "Feature1|Feature2|Feature3"
        cleaned.features = product.features
          .split('|')
          .map(f => String(f).trim())
          .filter(f => f);
      }
    } catch (err) {
      warnings.push(`Row ${rowIndex}: Failed to parse features, skipped`);
      cleaned.features = [];
    }
  } else {
    cleaned.features = [];
  }

  // Validate category - should be valid category name or ID
  if (product.category) {
    cleaned.category = String(product.category).trim();
    // TODO: Check nếu category tồn tại trong DB
  }

  // Validate supplier - should be valid supplier name or ID
  if (product.supplier) {
    cleaned.supplier = String(product.supplier).trim();
    // TODO: Check nếu supplier tồn tại trong DB
  }

  // Optional fields
  if (product.image) {
    cleaned.image = String(product.image).trim();
  }

  if (product.images && Array.isArray(product.images)) {
    cleaned.images = product.images.map(img => String(img).trim());
  } else if (product.images && typeof product.images === 'string') {
    // Parse pipe-separated images
    cleaned.images = product.images.split('|').map(img => String(img).trim()).filter(img => img);
  }

  if (product.featured !== undefined) {
    cleaned.featured = Boolean(product.featured === 'true' || product.featured === true || product.featured === 1);
  }

  // FIX #7: Validate deal object if provided
  if (product.deal) {
    try {
      let dealObj;

      if (typeof product.deal === 'string') {
        dealObj = JSON.parse(product.deal);
      } else if (typeof product.deal === 'object') {
        dealObj = product.deal;
      } else {
        throw new Error('Deal must be a JSON object');
      }

      if (dealObj && typeof dealObj === 'object') {
        const deal = {};

        // Validate discount (0-100)
        // Skip empty string from CSV (deal_discount column is empty)
        if (dealObj.discount !== undefined && dealObj.discount !== '' && dealObj.discount !== null) {
          const discount = parseFloat(dealObj.discount);
          if (isNaN(discount) || discount < 0 || discount > 100) {
            warnings.push(`Row ${rowIndex}: Deal discount must be 0-100, got: ${dealObj.discount}`);
          } else {
            deal.discount = discount;
          }
        }

        // Validate endTime (must be future date)
        // Skip empty string from CSV (deal_endTime column is empty)
        if (dealObj.endTime !== undefined && dealObj.endTime !== '' && dealObj.endTime !== null) {
          const endTime = new Date(dealObj.endTime);
          if (isNaN(endTime.getTime())) {
            warnings.push(`Row ${rowIndex}: Invalid endTime, must be a valid date`);
          } else if (endTime <= new Date()) {
            warnings.push(`Row ${rowIndex}: endTime must be a future date, not past`);
          } else {
            deal.endTime = endTime;
          }
        }

        if (Object.keys(deal).length > 0) {
          cleaned.deal = deal;
        }
      }
    } catch (err) {
      warnings.push(`Row ${rowIndex}: Failed to parse deal object, skipped. Error: ${err.message}`);
    }
  }

  // Description is optional, allow empty string
  if (product.description !== undefined && product.description !== null) {
    cleaned.description = String(product.description).trim();
  } else {
    cleaned.description = '';
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleaned,
  };
}

/**
 * Normalize spec field names using pattern matching
 * Convert "Loạichuột" → "mouseType", etc.
 * @param {Object} specs - Raw specs object
 * @returns {Object} Normalized specs object
 */
function normalizeSpecNames(specs) {
  if (!specs || typeof specs !== 'object') return {};

  const normalized = {};

  const fieldPatterns = {
    'connection': /kết.*nối|phương.*thức.*kết.*nối|wireless|wired|bluetooth|dongle/,
    'weight': /trọng.*lương|weight/,
    'battery': /pin|thời.*lương.*pin|battery|thời.*gian.*pin|giờ/,
    'mouseType': /loại.*chuột|mouse.*type|chuột/,
    'maxDPI': /dpi|cpi|max.*dpi|độ.*nhạy/,
    'pollRate': /poll.*rate|hz|khz|report.*rate|tốc.*độ.*báo.*cáo/,
    'buttons': /nút.*bấm|button|lượng.*nút|số.*nút/,
  };

  for (const [key, value] of Object.entries(specs)) {
    const normalizedKey = smartNormalizeFieldNameHelper(key, fieldPatterns);
    normalized[normalizedKey] = value;
  }

  return normalized;
}

/**
 * Helper: Smart field name normalization
 */
function smartNormalizeFieldNameHelper(fieldName, patterns) {
  const normalized = fieldName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');

  for (const [fieldKey, pattern] of Object.entries(patterns)) {
    if (pattern.test(normalized)) {
      return fieldKey;
    }
  }

  // Fallback: return as-is
  return fieldName;
}

/**
 * Validate full product array khi import
 * @param {Array} products - Mảng products từ import
 * @returns {Object} { isValid, errors, warnings, validProducts: [], invalidProducts: [] }
 */
function validateProductArray(products) {
  if (!Array.isArray(products)) {
    return {
      isValid: false,
      errors: ['Import data phải là mảng (array)'],
      warnings: [],
      validProducts: [],
      invalidProducts: [],
    };
  }

  if (products.length === 0) {
    return {
      isValid: false,
      errors: ['Import data phải chứa ít nhất một sản phẩm'],
      warnings: [],
      validProducts: [],
      invalidProducts: [],
    };
  }

  const validProducts = [];
  const invalidProducts = [];
  const allErrors = [];
  const allWarnings = [];

  products.forEach((product, index) => {
    const result = validateProduct(product, index + 1);
    if (result.isValid) {
      validProducts.push(result.cleaned);
    } else {
      invalidProducts.push({
        rowIndex: index + 1,
        data: product,
        errors: result.errors,
      });
    }
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    totalProducts: products.length,
    validProducts,
    invalidProducts,
  };
}

/**
 * Validate category/supplier name để tránh injection, data pollution
 *
 * Rules:
 * - Length: 1-100 characters
 * - Allowed: alphanumeric, space, dash, underscore, tiếng Việt
 * - No special characters: @#$%^&*()+={}[];:"'<>,.?/|\`~
 * - No leading/trailing spaces
 * - No multiple consecutive spaces
 * - No SQL/NoSQL keywords
 *
 * @param {String} name - Name to validate
 * @returns {Object} { isValid, error }
 */
function validateCategorySupplierName(name) {
  // Trim whitespace
  const trimmed = String(name || '').trim();

  // Check length
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Tên không được để trống' };
  }
  if (trimmed.length > 100) {
    return { isValid: false, error: 'Tên quá dài (tối đa 100 ký tự)' };
  }

  // Check for multiple consecutive spaces
  if (/\s{2,}/.test(trimmed)) {
    return { isValid: false, error: 'Không được có nhiều khoảng trắng liên tiếp' };
  }

  // Allow only: alphanumeric, space, dash, underscore, tiếng Việt (Unicode)
  // Pattern: [\w\u0100-\u017F\u1E00-\u1EFF\s-] = word chars + Latin extended + Vietnamese + space + dash
  const allowedPattern = /^[\w\u0100-\u017F\u1E00-\u1EFF\s\-]+$/;
  if (!allowedPattern.test(trimmed)) {
    return {
      isValid: false,
      error: 'Tên chỉ được chứa chữ, số, khoảng trắng, dash (-) và underscore (_)'
    };
  }

  // Block dangerous keywords (NoSQL injection prevention)
  const dangerousKeywords = [
    '$ne', '$gt', '$lt', '$in', '$nin', '$or', '$and', '$nor',
    'db.', 'function', 'eval', 'constructor', 'prototype',
    'exec', 'spawn', 'fork', 'require',
  ];
  const lowerTrimmed = trimmed.toLowerCase();
  for (const keyword of dangerousKeywords) {
    if (lowerTrimmed.includes(keyword)) {
      return {
        isValid: false,
        error: `Tên chứa ký tự hoặc từ khóa không được phép: ${keyword}`
      };
    }
  }

  return { isValid: true };
}

/**
 * Sanitize category/supplier name
 * - Trim whitespace
 * - Normalize multiple spaces to single space
 * - Remove accents for consistency (optional)
 *
 * @param {String} name
 * @returns {String} Sanitized name
 */
function sanitizeCategorySupplierName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

module.exports = {
  validateProduct,
  validateProductArray,
  normalizeSpecNames,
  validateCategorySupplierName,
  sanitizeCategorySupplierName,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
};
