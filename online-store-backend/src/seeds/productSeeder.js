/**
 * Database Seeder - Fetch sản phẩm từ 6 collections của Gearvn
 * Lấy dữ liệu đa dạng: Bàn phím, Chuột, Tai nghe, Tản nhiệt, Laptop Gaming, Laptop Văn phòng
 */

const Product = require('../models/Product');

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
  // Handle: kg, k (kilogram shorthand), g, mg, t (metric ton)
  if (specField === 'weight') {
    // Try to match and convert various units to grams
    // kg or K or kilogram → convert to grams
    let kgMatch = lowerValue.match(/^([\d.,]+)\s*(?:kg|k\b|kilogram)/i);
    if (kgMatch) {
      const kg = parseFloat(kgMatch[1].replace(/,/g, '.'));
      return Math.round(kg * 1000) + 'g';
    }

    // g or gram → keep as-is
    let gMatch = lowerValue.match(/^([\d.,]+)\s*(?:g\b|gram)/i);
    if (gMatch) {
      return Math.round(parseFloat(gMatch[1].replace(/,/g, '.'))) + 'g';
    }

    // mg or milligram → convert to grams
    let mgMatch = lowerValue.match(/^([\d.,]+)\s*(?:mg|milligram)/i);
    if (mgMatch) {
      const mg = parseFloat(mgMatch[1].replace(/,/g, '.'));
      return (mg / 1000).toFixed(2) + 'g';
    }

    // t or ton (metric ton) → convert to grams
    let tMatch = lowerValue.match(/^([\d.,]+)\s*(?:t\b|ton|tấn)/i);
    if (tMatch) {
      const tons = parseFloat(tMatch[1].replace(/,/g, '.'));
      return Math.round(tons * 1000000) + 'g';
    }
  }

  // Battery: Normalize to standard unit "giờ" for time-based, or "mAh" for energy-based
  if (specField === 'battery') {
    // First clean up any split or malformed units like "g (iờ)", "t (iếng)"
    let cleanValue = lowerValue
      .replace(/g\s*\(\s*i?ờ[n]?g?\s*\)/gi, 'giờ')     // "g (iờ)" → "giờ"
      .replace(/t\s*\(\s*i?ế[n]?ng\s*\)/gi, 'giờ')     // "t (iếng)" → "giờ"
      .replace(/ti\s*\(\s*ế[n]?ng\s*\)/gi, 'giờ')      // "ti (ếng)" → "giờ"
      .replace(/tiếng/gi, 'giờ')                        // Normalize "tiếng" to "giờ"
      .trim();

    // Try to match time units first (h, hour, giờ)
    let timeMatch = cleanValue.match(/^([\d.,]+)\s*(?:h\b|hour|hours|giờ)/i);
    if (timeMatch && timeMatch[1]) {
      return parseInt(parseFloat(timeMatch[1].replace(/,/g, '.'))) + ' giờ';
    }

    // Try to match energy units (mAh, Wh, Ah)
    let energyMatch = cleanValue.match(/^([\d.,]+)\s*(?:mah|wh|ah|ma?h)\b/i);
    if (energyMatch && energyMatch[1]) {
      const value = parseFloat(energyMatch[1].replace(/,/g, '.'));
      // Normalize to mAh if it's a round number or clearly mAh
      if (cleanValue.match(/mah\b/i)) {
        return Math.round(value) + ' mAh';
      } else if (cleanValue.match(/wh\b/i)) {
        return Math.round(value) + ' Wh';
      } else {
        // Default to mAh for generic "h" unit with large numbers (typical mAh values)
        return (value > 100) ? Math.round(value) + ' mAh' : Math.round(value) + ' giờ';
      }
    }

    // Fallback: if no match, return original
    return value;
  }

  // Impedance: Normalize to Ω
  if (specField === 'impedance') {
    const ohmsMatch = lowerValue.match(/^([\d.]+)\s*(?:ohm|ω|Ω|ôm|ohms?)/i);
    if (ohmsMatch) {
      return ohmsMatch[1] + ' Ω';
    }
    // Fallback: just add unit if number detected
    const numMatch = lowerValue.match(/^([\d.]+)/);
    if (numMatch) {
      return numMatch[1] + ' Ω';
    }
  }

  // Driver: Ensure mm unit
  if (specField === 'driver') {
    const driverMatch = lowerValue.match(/^([\d.]+)\s*(?:mm)?(?:\s*driver)?/i);
    if (driverMatch && driverMatch[1]) {
      return driverMatch[1] + 'mm Driver';
    }
  }

  // Frequency: Ensure Hz unit (handle ranges like "20 - 20000 Hz")
  if (specField === 'frequency') {
    const freqMatch = lowerValue.match(/^([\d.,]+)\s*-\s*([\d.,]+)\s*(?:hz|khz|mhz)?/i);
    if (freqMatch) {
      const start = parseFloat(freqMatch[1].replace(/,/g, '.'));
      const end = parseFloat(freqMatch[2].replace(/,/g, '.'));
      return start + ' - ' + end + ' Hz';
    }
    // Single frequency value
    const singleFreq = lowerValue.match(/^([\d.]+)\s*(?:hz|khz|mhz)?/i);
    if (singleFreq) {
      return singleFreq[1] + ' Hz';
    }
  }

  // Cable length: Normalize to meters (m)
  if (specField === 'cableLength') {
    // cm → m
    const cmMatch = lowerValue.match(/^([\d.,]+)\s*cm/i);
    if (cmMatch) {
      const cm = parseFloat(cmMatch[1].replace(/,/g, '.'));
      return (cm / 100).toFixed(2) + 'm';
    }
    // Already in meters
    const mMatch = lowerValue.match(/^([\d.,]+)\s*m(?:eter)?/i);
    if (mMatch) {
      return parseFloat(mMatch[1].replace(/,/g, '.')).toFixed(2) + 'm';
    }
  }

  // TDP: Ensure W unit
  if (specField === 'tdp') {
    const tdpMatch = lowerValue.match(/^([\d.]+)\s*(?:w(?:att)?s?)?/i);
    if (tdpMatch && tdpMatch[1]) {
      return parseInt(parseFloat(tdpMatch[1])) + 'W';
    }
  }

  // Fan speed: Ensure RPM unit (handle ranges like "1200 - 2000 RPM")
  if (specField === 'fanSpeed') {
    const rpmRangeMatch = lowerValue.match(/^([\d.]+)\s*-\s*([\d.]+)\s*(?:rpm|rps)?/i);
    if (rpmRangeMatch) {
      return rpmRangeMatch[1] + ' - ' + rpmRangeMatch[2] + ' RPM';
    }
    // Single RPM value
    const rpmMatch = lowerValue.match(/^([\d.]+)/);
    if (rpmMatch && !lowerValue.includes('rpm')) {
      return rpmMatch[1] + ' RPM';
    }
  }

  // Noise level: Ensure dB unit
  if (specField === 'noiseLevel') {
    const dbMatch = lowerValue.match(/^([\d.]+)\s*(?:db)?/i);
    if (dbMatch && dbMatch[1] && !lowerValue.includes('db')) {
      return dbMatch[1] + ' dB';
    }
    // Already has dB
    if (lowerValue.includes('db')) {
      return lowerValue.replace(/db/i, 'dB');
    }
  }

  // RAM/Storage: Normalize to GB (convert TB to GB if needed)
  if (specField === 'ram' || specField === 'storage') {
    // TB → GB
    const tbMatch = lowerValue.match(/^([\d.]+)\s*(?:tb|terabyte)/i);
    if (tbMatch) {
      const tb = parseFloat(tbMatch[1]);
      return (tb * 1024) + ' GB';
    }
    // GB → keep as-is
    const gbMatch = lowerValue.match(/^([\d.]+)\s*(?:gb|gigabyte)?/i);
    if (gbMatch) {
      return parseInt(parseFloat(gbMatch[1])) + ' GB';
    }
    // MB → convert to GB
    const mbMatch = lowerValue.match(/^([\d.]+)\s*(?:mb|megabyte)/i);
    if (mbMatch) {
      const mb = parseFloat(mbMatch[1]);
      return (mb / 1024).toFixed(2) + ' GB';
    }
  }

  // Display: Ensure inch unit (normalize to inches with ")
  if (specField === 'display') {
    // Already has "
    if (lowerValue.includes('"')) {
      return lowerValue;
    }
    // inch or inches
    const inchMatch = lowerValue.match(/^([\d.]+)\s*(?:inch|in)?/i);
    if (inchMatch) {
      return inchMatch[1] + '"';
    }
  }

  return value;
};

/**
 * Extract features từ description text
 * @param {String} description - Product description
 * @param {String} categoryName - Loại sản phẩm (Laptop, Bàn phím, etc)
 * @returns {Array} Array of features
 */
const extractFeatures = (description = '', categoryName = '') => {
  const features = [];

  // Luôn thêm features cơ bản
  features.push('Thương hiệu chính hãng');
  features.push('Bảo hành chính hãng');
  features.push('Giao hàng nhanh chóng');

  if (!description) return features;

  const descLower = description.toLowerCase();

  // Extract features từ description - match tất cả khả năng
  const featureKeywords = {
    'kết nối không dây|wireless|2\\.?4ghz|bluetooth|kết nối': 'Kết nối không dây',
    'rgb|led|đèn|light|backlit|đèn nền': 'Đèn RGB/Nền',
    'chống nước|waterproof|ip[0-9]|ip67|ip68|water resistant': 'Chống nước',
    'pin|battery|sạc|charging': 'Pin lâu',
    'gọn gàng|compact|nhỏ gọn|mini|portable': 'Thiết kế gọn gàng',
    'êm ái|comfortable|êm|smooth|soft': 'Typing feel êm ái',
    'programmable|lập trình|custom|customizable': 'Có thể lập trình',
    'mechanical|cơ học|switch|axis': 'Switch cơ học',
    'ergonomic|thoải mái|ergonomic|comfort': 'Thiết kế ergonomic',
    'silent|yên tĩnh|im lặng|quiet|noise|low noise': 'Hoạt động yên tĩnh',
    'dual|triple|multiple|multi|hai|ba|ba chế độ': 'Kết nối đa thiết bị',
    'light weight|nhẹ|lightweight|durable|bền': 'Thiết kế nhẹ & bền',
    'magnetic|từ tính|keycap|pbt': 'Thiết kế cao cấp',
    'gaming|game|chơi game|performance|hiệu năng': 'Dành cho gaming',
    'business|văn phòng|office|work|làm việc': 'Dành cho văn phòng',
    'professional|chuyên nghiệp|studio|producer': 'Dành cho chuyên gia',
    'hot swap|thay switch|hotswap': 'Thay switch dễ dàng',
  };

  Object.entries(featureKeywords).forEach(([keywords, feature]) => {
    const regex = new RegExp(keywords, 'i');
    if (regex.test(descLower) && !features.includes(feature)) {
      features.push(feature);
    }
  });

  // Thêm features dựa trên categoryName
  if (categoryName.includes('Laptop Gaming')) {
    if (!features.some(f => f.includes('gaming'))) {
      features.push('Hiệu năng gaming mạnh mẽ');
    }
  } else if (categoryName.includes('Laptop Văn phòng')) {
    if (!features.some(f => f.includes('văn phòng'))) {
      features.push('Phù hợp dùng văn phòng');
    }
  } else if (categoryName.includes('Bàn phím')) {
    if (!features.some(f => f.includes('switch'))) {
      features.push('Switch chất lượng cao');
    }
  } else if (categoryName.includes('Chuột')) {
    if (!features.some(f => f.includes('DPI'))) {
      features.push('Độ nhạy DPI cao');
    }
  } else if (categoryName.includes('Tai nghe')) {
    if (!features.some(f => f.includes('âm'))) {
      features.push('Âm thanh sắc nét');
    }
  }

  return features.slice(0, 6); // Max 6 features
};

/**
 * Parse tags từ gearvn để extract specs
 * Hỗ trợ 2 format:
 * 1. CSV string: "key1:value1,key2:value2"
 * 2. Array: ["spec_DPI:100-36000", "spec_Kết nối:Wireless"]
 * @param {String|Array} tags - Tags từ gearvn (CSV string hoặc array)
 * @returns {Object} Specs object
 */
const parseSpecsFromTags = (tags) => {
  if (!tags || (Array.isArray(tags) && tags.length === 0)) return {};

  const specs = {};

  // Convert tags to array if it's a string
  let tagArray = Array.isArray(tags) ? tags : (tags || '').split(',');

  // Map old hl_* format to new field names
  const tagMap = {
    'hl_cpu': 'cpu',
    'hl_ram': 'ram',
    'hl_ssd': 'storage',
    'hl_storage': 'storage',
    'hl_lcd': 'display',
    'hl_vga': 'gpu',
    'hl_screen': 'display',
    'hl_hdd': 'storage',
  };

  // Parse each tag
  tagArray.forEach(tag => {
    if (!tag || typeof tag !== 'string') return;

    const trimmedTag = tag.trim();

    // Handle spec_* format (e.g., "spec_DPI:100 - 36.000 DPI")
    if (trimmedTag.startsWith('spec_')) {
      const colonIndex = trimmedTag.indexOf(':');
      if (colonIndex > 0) {
        let fieldName = trimmedTag.substring(5, colonIndex).trim(); // Remove "spec_"
        let fieldValue = trimmedTag.substring(colonIndex + 1).trim();

        // Normalize field names to English keys
        const fieldMap = {
          'DPI': 'maxDPI',
          'dpi': 'maxDPI',
          'Kết nối': 'connection',
          'kết nối': 'connection',
          'Trọng lượng': 'weight',
          'trọng lượng': 'weight',
          'Pin': 'battery',
          'pin': 'battery',
          'Cảm biến': 'sensor',
          'cảm biến': 'sensor',
          'Độ bền': 'durability',
          'độ bền': 'durability',
          'Bảo hành': 'warranty',
          'bảo hành': 'warranty',
          'Kích thước': 'size',
          'kích thước': 'size',
          'Driver': 'driver',
          'driver': 'driver',
          'Dải tần số': 'frequency',
          'dải tần số': 'frequency',
          'Trở kháng': 'impedance',
          'trở kháng': 'impedance',
          'Loại Switch': 'switchType',
          'loại switch': 'switchType',
          'Layout': 'layout',
          'layout': 'layout',
          'TDP': 'tdp',
          'tdp': 'tdp',
          'Tốc độ quạt': 'fanSpeed',
          'tốc độ quạt': 'fanSpeed',
          'Mức tiếng ồn': 'noiseLevel',
          'mức tiếng ồn': 'noiseLevel',
          'CPU': 'cpu',
          'cpu': 'cpu',
          'RAM': 'ram',
          'ram': 'ram',
          'Storage': 'storage',
          'storage': 'storage',
          'Ổ cứng': 'storage',
          'ổ cứng': 'storage',
          'Màn hình': 'display',
          'màn hình': 'display',
          'GPU': 'gpu',
          'gpu': 'gpu',
          'Tình trạng': 'condition',
          'tình trạng': 'condition',
          'Tìnhtrạng': 'condition',
          'Độ dài dây': 'cableLength',
          'độ dài dây': 'cableLength',
          'Độdàidây': 'cableLength',
          'Số lượng nút bấm': 'buttons',
          'số lượng nút bấm': 'buttons',
          'Sốlượngnútbấm': 'buttons',
          'Chất liệu Keycap': 'keycapMaterial',
          'chất liệu keycap': 'keycapMaterial',
          'Chấtliệukeycap': 'keycapMaterial',
          'LED': 'led',
          'Led': 'led',
          'led': 'led',
        };

        const key = fieldMap[fieldName] || fieldName.toLowerCase().replace(/\s+/g, '');
        if (fieldValue) {
          specs[key] = fieldValue;
        }
      }
    } else {
      // Handle old hl_* format
      const [key, value] = trimmedTag.split(':');
      if (tagMap[key] && value) {
        specs[tagMap[key]] = value.trim();
      }
    }
  });

  return specs;
};

/**
 * Normalize toàn bộ specs object (chuẩn hóa tất cả giá trị spec)
 * @param {Object} specs - Raw specs object từ tags hoặc description
 * @returns {Object} Normalized specs object
 */
const normalizeAllSpecs = (specs) => {
  if (!specs || typeof specs !== 'object') return {};

  const normalized = {};

  // Define các fields cần normalize và hàm normalize của chúng
  const specFields = [
    'weight', 'battery', 'impedance', 'driver', 'frequency', 'cableLength',
    'tdp', 'fanSpeed', 'noiseLevel', 'ram', 'storage', 'display'
  ];

  Object.entries(specs).forEach(([key, value]) => {
    if (!value) return;

    // Nếu field này cần normalize, gọi normalizeSpecValue
    if (specFields.includes(key)) {
      normalized[key] = normalizeSpecValue(value.toString(), key);
    } else {
      // Fields khác (switchType, layout, keycapMaterial, connection, etc) giữ nguyên
      normalized[key] = value.toString();
    }
  });

  return normalized;
};

/**
 * Extract keyboard-specific specs (Switch type, Keycap, Layout, Connection)
 * Chuẩn hóa: switchType, layout, keycapMaterial, connection
 */
const extractKeyboardSpecs = (text = '') => {
  const specs = {};
  if (!text) return specs;

  // Extract Switch type - very aggressive pattern matching
  const switchPatterns = [
    /(mechanical|membrane|optical|linear|tactile|clicky)\s*(?:switch)?/i,
    /(cherry|gateron|kailh|razer|steelseries|logitech|corsair)\s+([a-z0-9]+)?/i,
    /(mx|hot\s*swap|switch)[:\s]+([a-z0-9]+)/i,
    /switch[:\s]*([a-z0-9\s]+?)(?:,|\.|\s{2}|$)/i,
  ];
  for (const pattern of switchPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        specs.switchType = (match[1] + ' ' + match[2]).trim().substring(0, 50);
      } else {
        specs.switchType = match[0].trim().substring(0, 50);
      }
      break;
    }
  }

  // Fallback: look for switch color/type
  if (!specs.switchType) {
    const colorMatch = text.match(/(?:switch\s+)?(red|blue|brown|black|green|yellow|purple|white)\s*(?:switch)?/i);
    if (colorMatch) specs.switchType = colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1) + ' Switch';
  }

  // Fallback if nothing found
  if (!specs.switchType) {
    specs.switchType = 'Mechanical Switch';
  }

  // Extract Keycap material - chuẩn hóa tên material
  const capPatterns = [
    /(?:keycap|keycaps|keycap\s+material)[:\s]*([^\s,\.]+)/i,
    /(pbt|abs|double.?shot|dye.?sub|aluminum)/i,
  ];
  for (const pattern of capPatterns) {
    const match = text.match(pattern);
    if (match) {
      let capMaterial = match[0].replace(/keycap[s]?[:\s]*/i, '').trim().substring(0, 30);

      // Normalize keycap material names
      const capMap = {
        'dblshot': 'Double Shot',
        'doubleshot': 'Double Shot',
        'double-shot': 'Double Shot',
        'dyesub': 'Dye Sub',
        'dye-sub': 'Dye Sub',
        'dye sub': 'Dye Sub',
        'pbt': 'PBT',
        'abs': 'ABS',
        'aluminum': 'Aluminum',
      };

      capMaterial = capMap[capMaterial.toLowerCase()] || capMaterial;
      specs.keycapMaterial = capMaterial;
      break;
    }
  }

  // Extract Layout - normalize layout names
  const layoutPatterns = [
    /(60%|65%|75%|80%|100%|full\s*size|tkl|compact)/i,
    /(tenkeyless|full.?size|compact|ansi|iso)/i,
  ];
  for (const pattern of layoutPatterns) {
    const match = text.match(pattern);
    if (match) {
      let layout = match[0].trim();

      // Normalize layout names
      const layoutMap = {
        'tenkeyless': 'TKL (80%)',
        'full size': '100%',
        'fullsize': '100%',
        'compact': '60%-65%',
      };

      layout = layoutMap[layout.toLowerCase()] || layout;
      specs.layout = layout;
      break;
    }
  }

  // Fallback layout if not explicitly mentioned
  if (!specs.layout) {
    specs.layout = '60%-75%';
  }

  // Extract Connection - normalize to standard values
  if (/wireless|bluetooth|2\.4ghz|không dây|2.4g|rf\s+wireless|dongle|2\.4|usb\s+dongle/i.test(text)) {
    specs.connection = 'Wireless';
  } else if (/(?:usb|wired|có dây|kết nối dây|cable|wired)\b/i.test(text)) {
    specs.connection = 'Wired';
  } else if (/both|dual|3\s*mode|hybrid/i.test(text)) {
    specs.connection = 'Dual Mode';
  }

  return specs;
};

/**
 * Extract mouse-specific specs (DPI, Poll rate, Button count, Weight, Connection)
 */
const extractMouseSpecs = (text = '') => {
  const specs = {};
  if (!text) return specs;

  // Extract Max DPI - try multiple patterns, very aggressive
  const dpiPatterns = [
    /(\d+(?:,\d+)?)\s*(?:dpi|cpi)\s*(?:max)?/i,
    /(?:max|maximum|up\s+to|supports?)\s+(\d+(?:,\d+)?)\s*(?:dpi|cpi)/i,
    /dpi[:\s]+(\d+(?:,\d+)?)/i,
    /(\d{4,})\s*dpi/i, // Match like "16000 dpi"
  ];
  for (const pattern of dpiPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const dpiVal = parseInt(match[1].replace(/,/g, ''));
      if (dpiVal >= 400 && dpiVal <= 100000) { // Reasonable DPI range
        specs.maxDPI = match[1].replace(/,/g, '') + ' DPI';
        break;
      }
    }
  }

  // Fallback DPI if not found
  if (!specs.maxDPI) {
    specs.maxDPI = '3200+ DPI';
  }

  // Extract Poll rate (Hz) - try multiple patterns
  const pollPatterns = [
    /(\d+)\s*(?:hz|khz|report\s+rate)/i,
    /poll\s+rate[:\s]+(\d+)/i,
    /report\s+rate[:\s]+(\d+)/i,
  ];
  for (const pattern of pollPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Avoid matching years or other numbers
      const num = parseInt(match[1]);
      if (num >= 100 && num <= 10000) { // Reasonable Hz range
        specs.pollRate = match[1] + ' Hz';
        break;
      }
    }
  }

  // Extract Button count
  const buttonPatterns = [
    /(\d+)\s*(?:button|nút|click|side\s+button)/i,
    /button[:\s]+(\d+)/i,
  ];
  for (const pattern of buttonPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const btnCount = parseInt(match[1]);
      if (btnCount >= 2 && btnCount <= 20) {
        specs.buttons = match[1] + ' Buttons';
        break;
      }
    }
  }

  // Extract Weight - normalize to grams (g)
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:g|gram|grams|kg|kilogram)/i);
  if (weightMatch) {
    let weight = parseFloat(weightMatch[1]);
    const unit = text.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|kg|kilogram)/i)[2].toLowerCase();

    // Convert kg to g if needed
    if (unit === 'kg' || unit === 'kilogram') {
      weight = weight * 1000;
    }

    specs.weight = parseInt(weight) + 'g';
  }

  // Extract Connection
  if (/wireless|bluetooth|2\.4ghz|không dây|2.4g|rf|2\.4\s*ghz|usb\s+receiver/i.test(text)) {
    specs.connection = 'Wireless';
  } else if (/wired|usb|có dây|kết nối dây|cable/i.test(text)) {
    specs.connection = 'Wired';
  }

  // Extract Battery time (for wireless mice) - multiple patterns to handle variations
  // Clean up text to handle malformed split units like "g(iờ)", "ti(ếng)" → normalize to recognizable units
  const cleanBatteryText = text
    // Handle split/malformed Vietnamese units with parentheses (from raw Gearvn data)
    .replace(/t\s*\(\s*i\s*ế\s*ng\s*\)/gi, 'tiếng')     // "t (i ế n g)" → "tiếng"
    .replace(/t\s*\(\s*i?ế[n]?ng\s*\)/gi, 'tiếng')     // "t (ếng)", "t (iếng)" → "tiếng"
    .replace(/ti\s*\(\s*ế[n]?ng\s*\)/gi, 'tiếng')      // "ti (ếng)", "ti (iếng)" → "tiếng"

    .replace(/g\s*\(\s*i\s*ờ\s*\)/gi, 'giờ')           // "g (i ờ )" → "giờ"
    .replace(/g\s*\(\s*i?ờ[n]?g?\s*\)/gi, 'giờ')       // "g (iờ)", "g (ờ)" → "giờ"
    .replace(/h\s*\(\s*our\s*s?\s*\)/gi, 'hour')       // "h (our)" → "hour"
    // Normalize Vietnamese hour variants to standard "giờ" (tiếng is colloquial, use giờ)
    .replace(/\btiếng\b/gi, 'giờ');                     // "tiếng" → "giờ" (normalize to standard)

  const batteryPatterns = [
    /(?:lâu|lasts?|lasting|up\s+to)?\s*(\d+)\s*(?:giờ|hour|hours|h)(?:\s*\(.*?\))?/i,  // "95 giờ", "20 hours", "20h", "lâu 95 giờ"
    /pin[:\s]*(?:up\s+to\s+)?(\d+)\s*(?:giờ|hour|hours|h)/i,  // "pin: 95 giờ", "pin lâu 20 giờ"
    /(?:battery|pin)\s+(?:time|lasts?|lasting)\s+(?:up\s+to\s+)?(\d+)\s*(?:giờ|hour|hours|h)/i,
  ];

  for (const pattern of batteryPatterns) {
    const match = cleanBatteryText.match(pattern);
    if (match && match[1]) {
      const batteryVal = parseInt(match[1]);
      if (batteryVal >= 3 && batteryVal <= 1000) { // Reasonable battery time range
        // Chuẩn hóa thành "X giờ" (giờ là đơn vị chuẩn cho pin time)
        specs.battery = batteryVal + ' giờ';
        break;
      }
    }
  }

  return specs;
};

/**
 * Extract headphone-specific specs (Driver, Frequency response, Impedance, Cable)
 */
const extractHeadphoneSpecs = (text = '') => {
  const specs = {};
  if (!text) return specs;

  // Extract Driver size (40mm, 50mm, etc) - chuẩn hóa thành mm
  const driverPatterns = [
    /(\d+)(?:\.\d+)?\s*(?:mm|millimeter)\s*(?:driver|speaker|unit)?/i,
    /driver[:\s]+(\d+)(?:\.\d+)?\s*mm/i,
    /(\d+)mm\s+driver/i,
  ];
  for (const pattern of driverPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const drvSize = parseInt(match[1]);
      if (drvSize >= 8 && drvSize <= 100) {
        specs.driver = normalizeSpecValue(match[1] + ' mm driver', 'driver');
        break;
      }
    }
  }

  // Fallback driver if not found
  if (!specs.driver) {
    specs.driver = '40mm Driver';
  }

  // Extract Frequency response - chuẩn hóa thành Hz
  const freqPatterns = [
    /(\d+)(?:\.\d+)?\s*(?:hz|khz)?\s*[-~]\s*(\d+)(?:\.\d+)?\s*(?:hz|khz)/i,
    /frequency[:\s]+(\d+)[^0-9]*(\d+)\s*(?:hz|khz)/i,
    /(\d{2,5})[\s-]+(\d{2,5})\s*hz/i,
  ];
  for (const pattern of freqPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const freq1 = parseInt(match[1]);
      const freq2 = parseInt(match[2]);
      if (freq1 > 0 && freq2 > freq1 && freq2 <= 50000) {
        specs.frequency = normalizeSpecValue(match[1] + ' - ' + match[2] + ' Hz', 'frequency');
        break;
      }
    }
  }

  // Fallback frequency if not found
  if (!specs.frequency) {
    specs.frequency = '20 - 20000 Hz';
  }

  // Extract Impedance - chuẩn hóa thành Ω
  const impedanceMatch = text.match(/(\d+)\s*(?:ohm|ω|Ω|ôm|\u03A9)/i);
  if (impedanceMatch) {
    specs.impedance = normalizeSpecValue(impedanceMatch[1] + ' Ω', 'impedance');
  }

  // Extract Cable length - chuẩn hóa thành meter (m)
  const cableMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|cm|centimeter)(?:eter)?(?:\s|$|,|;)/i);
  if (cableMatch) {
    let cableLength = parseFloat(cableMatch[1]);
    const cableUnit = text.match(/(\d+(?:\.\d+)?)\s*(m|meter|cm|centimeter)/i)?.[2]?.toLowerCase() || 'm';

    // Convert cm to m if needed
    if (cableUnit.includes('cm')) {
      cableLength = cableLength / 100;
    }

    specs.cableLength = normalizeSpecValue(cableLength + 'm', 'cableLength');
  }

  // Extract Connection
  if (/wireless|bluetooth|không dây|2\.4g|rf|radio|usb\s*receiver|usb-c|usb\s+type/i.test(text)) {
    specs.connection = 'Wireless';
  } else if (/wired|có dây|3\.5mm|jack|usb|kết nối dây|cable|aux/i.test(text)) {
    specs.connection = 'Wired 3.5mm';
  }

  return specs;
};

/**
 * Extract cooler-specific specs (Type, TDP, RPM, Noise level)
 */
const extractCoolerSpecs = (text = '') => {
  const specs = {};
  if (!text) return specs;

  // Extract Type (AIO, Air, etc) - very clear logic
  if (/aio|liquid|nước|water\s*block|loop|radiator|all.?in.?one/i.test(text)) {
    specs.type = 'AIO Liquid';
  } else if (/air|không khí|heatsink|fan|passive|tower|downdraft/i.test(text)) {
    specs.type = 'Air Cooler';
  } else {
    specs.type = 'Air Cooler'; // Default fallback
  }

  // Extract TDP - chuẩn hóa thành Watt (W)
  const tdpPatterns = [
    /(?:tdp|support|up\s+to|max)\s+(\d+)\s*w(?:att)?s?/i,
    /(\d+)\s*w(?:atts?)?(?:\s*tdp|max|support)?/i,
    /tdp[:\s]*(\d+)w/i,
    /(\d{2,3})w\b/i,
  ];
  for (const pattern of tdpPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const wattage = parseInt(match[1]);
      if (wattage >= 50 && wattage <= 1000) { // Reasonable range
        specs.tdp = normalizeSpecValue(match[1] + 'W', 'tdp');
        break;
      }
    }
  }

  // Fallback TDP if not found
  if (!specs.tdp) {
    specs.tdp = '95W';
  }

  // Extract RPM (Fan speed) - chuẩn hóa thành RPM
  const rpmPatterns = [
    /(?:max|up\s+to)?\s*(\d+)\s*(?:[-~]\s*)?(\d+)?\s*rpm/i,
    /rpm[:\s]+(\d+)(?:[-~](\d+))?/i,
    /(\d{3,4})[\s-]+(\d{3,4})\s*rpm/i,
  ];
  for (const pattern of rpmPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        specs.fanSpeed = normalizeSpecValue(match[1] + '-' + match[2] + ' RPM', 'fanSpeed');
      } else {
        specs.fanSpeed = normalizeSpecValue(match[1] + ' RPM', 'fanSpeed');
      }
      break;
    }
  }

  // Extract Noise level - chuẩn hóa thành dB
  const noiseMatch = text.match(/(\d+(?:\.\d+)?)\s*d[bb]/i);
  if (noiseMatch) {
    specs.noiseLevel = normalizeSpecValue(noiseMatch[1] + ' dB', 'noiseLevel');
  }

  return specs;
};

/**
 * Extract laptop-specific specs (CPU, RAM, Storage, GPU, Display)
 */
const extractLaptopSpecs = (text = '') => {
  const specs = {};
  const fullText = text.toLowerCase();

  // Extract CPU (Intel Core i3/i5/i7/i9, AMD Ryzen)
  const cpuPatterns = [
    /intel\s+core\s+ultra\s+[357]\s*-?\d{3,4}[a-z]*/i,
    /intel\s+core\s+i[3579]\s*-?\s*\d{5}(?:\s*[a-z]+)?/i,
    /intel\s+core\s+i[3579][-\s]?(?:\s*gen|\s*13th|\s*12th|\s*11th|\s*10th)?\s*(?:generation)?\s*\d{1,2}[a-z]*/i,
    /amd\s+ryzen\s+[357]\s*(?:pro\s+)?(?:h|u|p)?\s*\d{3,4}\s*[a-z]*/i,
    /ryzen\s+[357]\s*-?\s*\d{4,5}(?:\s*[a-z]+)?/i,
    /core\s+i[3579]\s*-?\d{4,5}/i,
  ];
  for (const pattern of cpuPatterns) {
    const match = text.match(pattern);
    if (match) {
      specs.cpu = match[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // Extract RAM - chuẩn hóa thành GB
  const ramPatterns = [
    /(\d+)\s*gb\s*(?:ddr[0-9]|ram|memory|ddr)?/i,
    /(?:ddr[0-9]|memory|ram)[:\s]+(\d+)\s*gb/i,
    /memory[:\s]*(\d+)\s*gb/i,
  ];
  for (const pattern of ramPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const ramSize = parseInt(match[1]);
      if (ramSize >= 2 && ramSize <= 256) { // Extended range
        specs.ram = normalizeSpecValue(match[1] + ' GB', 'ram');
        break;
      }
    }
  }

  // Fallback RAM if not found
  if (!specs.ram && /laptop|notebook/i.test(text)) {
    specs.ram = '8 GB';
  }

  // Extract Storage - chuẩn hóa thành GB (convert TB nếu cần)
  const storagePatterns = [
    /(\d+)\s*(?:gb|tb)\s*(?:ssd|nvme|hdd|storage|m\.2|pcie)/i,
    /(?:ssd|nvme|storage|disk)[:\s]+(\d+)\s*(gb|tb)/i,
    /(\d+)\s*(tb|gb)\s*(?:ssd|nvme|hdd|pcie|m\.2)?/i,
  ];
  for (const pattern of storagePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const size = match[1];
      const unit = (match[2] || 'GB').toUpperCase();
      const storageNum = parseInt(size);

      // Convert TB to GB if needed (for standardization)
      let storageValue = storageNum;
      let storageUnit = unit;

      if (unit === 'TB') {
        storageValue = storageNum * 1024;
        storageUnit = 'GB';
      }

      if (storageValue >= 64 && storageValue <= 4096) { // Valid range for laptops in GB
        specs.storage = normalizeSpecValue(storageValue + ' ' + storageUnit, 'storage');
        break;
      }
    }
  }

  // Fallback storage if not found
  if (!specs.storage) {
    specs.storage = '256 GB';
  }

  // Extract Display - chuẩn hóa thành inch (")
  const displayPatterns = [
    /(\d+(?:\.\d+)?)["\s]*(?:inch|in)\b/i,
    /display[:\s]+(\d+(?:\.\d+)?)\s*(?:inch)?/i,
    /screen[:\s]+(\d+(?:\.\d+)?)\s*(?:inch)?/i,
    /(\d+\.\d)["\']\s*display/i,
  ];
  for (const pattern of displayPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dispSize = parseFloat(match[1]);
      if (dispSize >= 10 && dispSize <= 17) {
        specs.display = normalizeSpecValue(match[1] + '"', 'display');
        break;
      }
    }
  }

  // Fallback display if not found
  if (!specs.display) {
    specs.display = '15.6"';
  }

  // Extract GPU - try multiple patterns
  const gpuPatterns = [
    /(?:nvidia\s*)?(?:geforce\s*)?(?:rtx|gtx|gts)\s*[1-4]\d{3}(?:\s*(?:super|ti|m))?/i,
    /nvidia\s+(?:rtx|gtx)\s*[0-9]{3,4}/i,
    /amd\s+radeon\s+(?:rx\s*)?[67]\d{3}\s*(?:xt|xtx)?/i,
    /radeon\s+(?:rx\s*)?[67]\d{3}/i,
    /intel\s+(?:iris|arc)\s+(?:xe\s+)?(?:graphics\s+)?[0-9a-z]+/i,
    /arc\s+[a-z]*\s*[0-9a-z]+/i,
  ];
  for (const pattern of gpuPatterns) {
    const match = text.match(pattern);
    if (match) {
      specs.gpu = match[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  return specs;
};

/**
 * Extract specs từ description text (dùng cho các sản phẩm không có hl_* tags)
 * @param {String} description - Product description
 * @param {String} productTitle - Tên sản phẩm
 * @param {String} productType - Loại sản phẩm
 * @returns {Object} Specs object
 */
const extractSpecsFromDescription = (description = '', productTitle = '', productType = '') => {
  if (!description && !productTitle) return {};

  const fullText = (productTitle + ' ' + description).replace(/\n/g, ' ').replace(/\s+/g, ' ');
  let specs = {};

  // Route to category-specific extractor
  if (productType.includes('Bàn phím')) {
    specs = extractKeyboardSpecs(fullText);
  } else if (productType.includes('Chuột')) {
    specs = extractMouseSpecs(fullText);
  } else if (productType.includes('Tai nghe')) {
    specs = extractHeadphoneSpecs(fullText);
  } else if (productType.includes('Tản nhiệt')) {
    specs = extractCoolerSpecs(fullText);
  } else if (productType.includes('Laptop')) {
    specs = extractLaptopSpecs(fullText);
  } else {
    // Default: try laptop specs
    specs = extractLaptopSpecs(fullText);
  }

  return specs;
};

/**
 * Fetch sản phẩm từ URL Gearvn
 * @param {String} url - URL của collection Gearvn
 * @param {Number} limit - Số lượng sản phẩm muốn fetch (mặc định 20)
 * @returns {Array} Array of products
 */
const fetchGearvnProducts = async (url, limit = 20) => {
  try {
    const fullUrl = `${url}?limit=${limit}`;
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.products || [];
  } catch (error) {
    return [];
  }
};

/**
 * Map gearvn product data vào Product model
 * @param {Object} gearvnProduct - Product từ gearvn API
 * @param {ObjectId} userId - ID của admin
 * @param {ObjectId} categoryId - ID danh mục
 * @param {ObjectId} supplierId - ID nhà cung cấp
 * @param {String} categoryName - Tên danh mục (e.g., "Bàn phím", "Laptop Gaming")
 * @returns {Object} Product object ready to save
 */
const mapGearvnToProduct = (gearvnProduct, userId, categoryId, supplierId, categoryName = '') => {
  const variant = gearvnProduct.variants?.[0];
  const mainImage = gearvnProduct.image?.src || gearvnProduct.images?.[0]?.src;

  // Lấy tất cả images (có thể lên đến 7+ ảnh)
  let allImages = (gearvnProduct.images || []).map(img => img.src).filter(Boolean);
  if (allImages.length === 0 && mainImage) {
    allImages = [mainImage];
  }
  if (allImages.length === 0) {
    allImages = ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400'];
  }

  const price = parseInt(variant?.price || 0);
  const originalPrice = parseInt(variant?.compare_at_price || 0);
  const countInStock = variant?.inventory_quantity || Math.floor(Math.random() * 30 + 5);

  let discount = 0;
  if (originalPrice > price) {
    discount = Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  // Clean & decode HTML entities từ body_html
  let rawDescription = gearvnProduct.body_html || '';
  const cleanDescription = cleanHtmlContent(rawDescription);

  // **Parse specs từ tags trước (format: spec_FieldName:Value)**
  // Tags là array, ví dụ: ["spec_DPI:100 - 36.000 DPI", "spec_Kết nối:Bluetooth 5.1", ...]
  let specs = parseSpecsFromTags(gearvnProduct.tags);

  // Nếu specs từ tags không đủ (ít hơn 2 fields), cố gắng extract từ description
  if (Object.keys(specs).length < 2) {
    const descSpecs = extractSpecsFromDescription(cleanDescription, gearvnProduct.title, categoryName);
    // Merge: prioritize tags, fill gaps from description
    specs = { ...descSpecs, ...specs };
  }

  // **Normalize tất cả spec values trước khi save vào DB**
  specs = normalizeAllSpecs(specs);

  // Extract features từ description
  const features = extractFeatures(cleanDescription, categoryName);

  // Cắt description thành 500 ký tự, nếu không có thì dùng default
  const description = cleanDescription.length > 0
    ? cleanDescription.substring(0, 500).trim()
    : 'Sản phẩm chất lượng cao từ Gearvn';

  // **Sử dụng vendor trực tiếp làm brand (nó đã là tên hãng)**
  const brand = gearvnProduct.vendor || 'Unknown Brand';

  return {
    user: userId,
    name: gearvnProduct.title,
    image: mainImage || allImages[0],
    images: allImages, // Sử dụng tất cả images
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
    deal: discount > 15 ? {
      discount: discount,
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    } : {},
  };
};

/**
 * Seed dữ liệu sản phẩm từ 6 collections của Gearvn (20 sản phẩm mỗi danh mục)
 * Tổng: 6 danh mục × 20 sản phẩm = 120 sản phẩm
 * @param {ObjectId} userId - ID của admin
 * @param {Array} categoryIds - Danh sách ID danh mục (6 danh mục)
 * @param {Array} supplierIds - Danh sách ID nhà cung cấp
 */
const seedProducts = async (userId, categoryIds, supplierIds) => {
  try {
    await Product.deleteMany({});

    const allProducts = [];

    // Fetch từ tất cả 6 collections
    // Mỗi collection: 20 sản phẩm
    for (const collection of GEARVN_COLLECTIONS) {
      const productsFromCollection = await fetchGearvnProducts(collection.url, 20);

      // Map vào Product model
      const mappedProducts = productsFromCollection.map((gearvnProduct, index) => {
        const supplierIndex = index % supplierIds.length;
        const categoryId = categoryIds[collection.categoryIndex];
        return mapGearvnToProduct(gearvnProduct, userId, categoryId, supplierIds[supplierIndex], collection.name);
      });

      allProducts.push(...mappedProducts);
    }

    // Save vào database
    const createdProducts = await Product.create(allProducts);

    return createdProducts;
  } catch (error) {
    throw error;
  }
};

module.exports = seedProducts;
