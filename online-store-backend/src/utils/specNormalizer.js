/**
 * Backend Spec Normalizer - Standardize specs before saving to MongoDB
 * Converts any format specs to consistent English field names
 * Ensures data consistency regardless of seed data or import format
 */

/**
 * Map Vietnamese field names (all variations) to English keys
 * Handles Vietnamese with/without diacritics, camelCase, snake_case, etc.
 */
const vietnameseToEnglishSpecMap = {
  // ========== CONNECTION ==========
  'ketnoi': 'connection',
  'kết nối': 'connection',
  'phuongthucketnoi': 'connection',
  'phương thức kết nối': 'connection',
  'congketnoi': 'connection',
  'wireless': 'connection',
  'wired': 'connection',

  // ========== SWITCH TYPE / KEYBOARD ==========
  'switchtype': 'switchType',
  'switch type': 'switchType',
  'switch_type': 'switchType',
  'loaiswitch': 'switchType',
  'loại switch': 'switchType',
  'kieuswitch': 'switchType',
  'kiểu switch': 'switchType',

  // ========== LAYOUT ==========
  'layout': 'layout',
  'bucucphim': 'layout',
  'bố cục phím': 'layout',

  // ========== KEYCAP MATERIAL ==========
  'keycapmaterial': 'keycapMaterial',
  'keycap material': 'keycapMaterial',
  'keycap_material': 'keycapMaterial',
  'chatlieukeycap': 'keycapMaterial',
  'chất liệu keycap': 'keycapMaterial',
  'keycapprofile': 'keycapMaterial',
  'keycap profile': 'keycapMaterial',
  'chatlieunhua': 'keycapMaterial',
  'chất liệu nhựa': 'keycapMaterial',

  // ========== MOUSE ==========
  'mousetype': 'mouseType',
  'mouse type': 'mouseType',
  'mouse_type': 'mouseType',
  'loaichuot': 'mouseType',
  'loại chuột': 'mouseType',
  'maxdpi': 'maxDPI',
  'max dpi': 'maxDPI',
  'max_dpi': 'maxDPI',
  'dpi': 'maxDPI',
  'pollrate': 'pollRate',
  'poll rate': 'pollRate',
  'poll_rate': 'pollRate',
  'buttons': 'buttons',
  'sonut': 'buttons',
  'số nút': 'buttons',
  'soluongnutbam': 'buttons',
  'số lượng nút bấm': 'buttons',
  'soluongnut': 'buttons',
  'số lượng nút': 'buttons',

  // ========== HEADPHONE ==========
  'driver': 'driver',
  'kichthuocdriver': 'driver',
  'kích thước driver': 'driver',
  'driverunit': 'driver',
  'driver unit': 'driver',
  'kichthuocmangloa': 'driver',
  'kích thước màng loa': 'driver',
  'frequency': 'frequency',
  'daitanso': 'frequency',
  'dải tần số': 'frequency',
  'tanso': 'frequency',
  'tần số': 'frequency',
  'tansohoatdong': 'frequency',
  'tần số hoạt động': 'frequency',
  'impedance': 'impedance',
  'trokhang': 'impedance',
  'trở kháng': 'impedance',
  'dien tro': 'impedance',
  'điện trở': 'impedance',
  'cablelength': 'cableLength',
  'cable length': 'cableLength',
  'cable_length': 'cableLength',
  'dodaiday': 'cableLength',
  'độ dài dây': 'cableLength',
  'chieudaiday': 'cableLength',
  'chiều dài dây': 'cableLength',
  'capketnoi': 'cableLength',
  'cáp kết nối': 'cableLength',

  // ========== COOLER ==========
  'type': 'type',
  'loaitannhiet': 'type',
  'loại tản nhiệt': 'type',
  'kieu-tan-nhiet': 'type',
  'kiểu tản nhiệt': 'type',
  'tdp': 'tdp',
  'fanspeed': 'fanSpeed',
  'fan speed': 'fanSpeed',
  'fan_speed': 'fanSpeed',
  'tocdoquat': 'fanSpeed',
  'tốc độ quạt': 'fanSpeed',
  'noiselevel': 'noiseLevel',
  'noise level': 'noiseLevel',
  'noise_level': 'noiseLevel',
  'muctiengon': 'noiseLevel',
  'mức tiếng ồn': 'noiseLevel',
  'doon': 'noiseLevel',
  'độ ồn': 'noiseLevel',

  // ========== LAPTOP ==========
  'cpu': 'cpu',
  'processor': 'cpu',
  'xi-xu-ly': 'cpu',
  'xử lý': 'cpu',
  'ram': 'ram',
  'bo-nho': 'ram',
  'bộ nhớ': 'ram',
  'storage': 'storage',
  'o-cung': 'storage',
  'ổ cứng': 'storage',
  'ssd': 'storage',
  'hdd': 'storage',
  'display': 'display',
  'man-hinh': 'display',
  'màn hình': 'display',
  'gpu': 'gpu',
  'card-do-hoa': 'gpu',
  'card đồ họa': 'gpu',
  'vga': 'gpu',
  'os': 'os',
  'he-dieu-hanh': 'os',
  'hệ điều hành': 'os',

  // ========== WEIGHT & BATTERY ==========
  'weight': 'weight',
  'tronglương': 'weight',
  'trọng lượng': 'weight',
  'khoiluong': 'weight',
  'khối lượng': 'weight',
  'battery': 'battery',
  'pin': 'battery',
  'thoiluongpin': 'battery',
  'thời lượng pin': 'battery',
  'thoigianpin': 'battery',
  'thời gian pin': 'battery',

  // ========== COMMON ==========
  'condition': 'condition',
  'tinhnang': 'condition',
  'tình năng': 'condition',
  'tinhtrang': 'condition',
  'tình trạng': 'condition',
  'led': 'led',
  'warranty': 'warranty',
  'baohành': 'warranty',
  'bảo hành': 'warranty',
  'thoigianbaohanh': 'warranty',
  'thời gian bảo hành': 'warranty',
  'che-do-bao-hanh': 'warranty',
  'chế độ bảo hành': 'warranty',
  'sensor': 'sensor',
  'cambian': 'sensor',
  'cảm biến': 'sensor',
  'durability': 'durability',
  'doben': 'durability',
  'độ bền': 'durability',
  'size': 'size',
  'kichthuoc': 'size',
  'kích thước': 'size',
  'kichco': 'size',
  'kích cỡ': 'size',
  'thông số kích thước': 'size',
  'trong lượng': 'weight',
  'khoi luong': 'weight',
  'can nang': 'weight',
  'cân nặng': 'weight',
};

/**
 * List of valid English spec field names
 * Any field not in this list will be discarded as "junk data"
 */
const validSpecFields = new Set([
  'cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery',
  'switchType', 'layout', 'keycapMaterial', 'connection',
  'maxDPI', 'pollRate', 'buttons', 'mouseType',
  'driver', 'frequency', 'impedance', 'cableLength',
  'type', 'tdp', 'fanSpeed', 'noiseLevel',
  'condition', 'led', 'warranty', 'sensor', 'durability', 'size'
]);

/**
 * Normalization Map for units and common technical terms
 */
const unitMap = {
  'gigabytes': 'GB',
  'gigabyte': 'GB',
  ' giga ': 'GB',
  ' g ': 'GB',
  'ram': 'RAM',
  'mah': 'mAh',
  'mhz': 'MHz',
  'ghz': 'GHz',
  'inches': '"',
  'inch': '"',
  'pixels': 'px',
  'pixel': 'px',
  'kilograms': 'kg',
  'kilogram': 'kg',
  'grams': 'g',
  'gram': 'g',
  'bluetooth': 'Bluetooth',
  'wireless': 'Wireless',
  'vga': 'VGA',
  'ssd': 'SSD',
  'hdd': 'HDD',
  'ips': 'IPS',
  'oled': 'OLED',
  'amoled': 'AMOLED',
};

/**
 * Standardizes a spec value by cleaning units and formatting
 * @param {string|number} value - Raw spec value
 * @param {string} field - Optional field name for specialized cleaning
 * @returns {string} Cleaned and standardized value
 */
function sanitizeSpecValue(value, field = '') {
  if (value === null || value === undefined) return '';

  let strValue = String(value).trim();
  if (!strValue) return '';

  // 1. Lowercase for unit replacement (except for specific cases)
  let lowerValue = strValue.toLowerCase();

  // 2. Apply unit mapping using Regex for boundary matching
  Object.keys(unitMap).forEach(unit => {
    // Match unit with boundaries (\b) to avoid partial replacement (e.g., "branding" -> "bRAMnding")
    const regex = new RegExp(`\\b${unit}\\b`, 'gi');
    strValue = strValue.replace(regex, unitMap[unit]);
  });

  // 3. Special handling for specific fields
  if (field === 'ram' || field === 'storage') {
    // "8 GB" -> "8GB", "512  GB" -> "512GB"
    strValue = strValue.replace(/(\d+)\s*(GB|TB|MB)/gi, (match, p1, p2) => p1 + p2.toUpperCase());
  }

  if (field === 'battery') {
    // "5000 mah" -> "5000mAh"
    strValue = strValue.replace(/(\d+)\s*(mah)/gi, (match, p1, p2) => p1 + 'mAh');
  }

  if (field === 'display') {
    // "15.6 inch" -> "15.6\""
    strValue = strValue.replace(/(\d+(?:\.\d+)?)\s*(inch|inches|")/gi, (match, p1) => p1 + '"');
  }

  // 4. Clean up multiple spaces and trim
  return strValue.replace(/\s+/g, ' ').trim();
}

/**
 * Remove Vietnamese diacritical marks for comparison
 * "Bàn phím" -> "ban phim"
 */
function removeDiacritics(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Normalize a spec field name from any format to English key
 * @param {string} fieldName - Raw field name from backend
 * @returns {string} Normalized English field key, or empty string if can't match
 */
function normalizeSpecFieldName(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') return '';

  // Remove spaces, convert to lowercase for matching
  const cleaned = fieldName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '') // Remove spaces
    .replace(/_/g, ''); // Remove underscores

  // Try exact match in map
  if (vietnameseToEnglishSpecMap[cleaned]) {
    return vietnameseToEnglishSpecMap[cleaned];
  }

  // Try match without diacritics
  const noDiacritics = removeDiacritics(fieldName).replace(/\s+/g, '').replace(/_/g, '');
  if (vietnameseToEnglishSpecMap[noDiacritics]) {
    return vietnameseToEnglishSpecMap[noDiacritics];
  }

  // Try partial matches for compound words
  for (const [key, value] of Object.entries(vietnameseToEnglishSpecMap)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return value;
    }
  }

  // If no match, try to handle camelCase
  const camelCased = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
  if (vietnameseToEnglishSpecMap[camelCased.toLowerCase()]) {
    return vietnameseToEnglishSpecMap[camelCased.toLowerCase()];
  }

  // Return empty string if can't normalize
  return '';
}

/**
 * Normalize a specs object before saving to MongoDB
 * - Converts Vietnamese field names to English keys
 * - Removes unknown/junk fields
 * - Merges duplicate fields with different names
 * - Keeps only valid spec fields
 * @param {Object} specs - Raw specs object from API or seed
 * @returns {Object} Normalized specs object
 */
function normalizeSpecs(specs) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) {
    return {};
  }

  const normalized = {};

  Object.entries(specs).forEach(([fieldName, value]) => {
    // Skip empty values
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
      return;
    }

    // Skip non-string/non-number values (objects, arrays, etc.)
    if (typeof value !== 'string' && typeof value !== 'number') {
      return;
    }

    // Normalize the field name
    const normalizedField = normalizeSpecFieldName(fieldName);

    // Only include if it's a valid known spec field
    if (normalizedField && validSpecFields.has(normalizedField)) {
      // Sanitize the value
      const cleanValue = sanitizeSpecValue(value, normalizedField);

      if (!cleanValue) return;

      // If field already exists, keep the longer/more detailed value
      if (normalized[normalizedField]) {
        const existingLen = String(normalized[normalizedField]).length;
        const newLen = String(cleanValue).length;
        if (newLen > existingLen) {
          normalized[normalizedField] = cleanValue;
        }
      } else {
        normalized[normalizedField] = cleanValue;
      }
    }
  });

  return normalized;
}

module.exports = {
  normalizeSpecs,
  normalizeSpecFieldName,
  validSpecFields,
};
