/**
 * Spec Config - Defines which specifications should be displayed for each product category
 * Maps category names to their relevant spec fields
 */

type SpecField = 'cpu' | 'ram' | 'storage' | 'display' | 'gpu' | 'os' | 'weight' | 'battery'
  | 'switchType' | 'layout' | 'keycapMaterial' | 'connection'
  | 'maxDPI' | 'pollRate' | 'buttons'
  | 'driver' | 'frequency' | 'impedance' | 'cableLength'
  | 'type' | 'tdp' | 'fanSpeed' | 'noiseLevel'
  | 'condition' | 'led' | 'warranty' | 'sensor' | 'durability' | 'size';

const specLabels: Record<SpecField, string> = {
  // Laptop specs
  cpu: 'CPU',
  ram: 'RAM',
  storage: 'Ổ cứng',
  display: 'Màn hình',
  gpu: 'Card đồ họa',
  os: 'Hệ điều hành',
  weight: 'Trọng lượng',
  battery: 'Pin',

  // Keyboard specs
  switchType: 'Loại Switch',
  layout: 'Layout',
  keycapMaterial: 'Chất liệu Keycap',

  // Mouse specs
  maxDPI: 'DPI tối đa',
  pollRate: 'Poll Rate',
  buttons: 'Số lượng nút bấm',

  // Headphone specs
  driver: 'Kích thước Driver',
  frequency: 'Dải tần số',
  impedance: 'Trở kháng',
  cableLength: 'Độ dài dây',

  // Cooler specs
  type: 'Loại tản nhiệt',
  tdp: 'TDP',
  fanSpeed: 'Tốc độ quạt',
  noiseLevel: 'Mức tiếng ồn',

  // Common
  connection: 'Kết nối',
  condition: 'Tình trạng',
  led: 'LED',
  warranty: 'Bảo hành',
  sensor: 'Cảm biến',
  durability: 'Độ bền',
  size: 'Kích thước',
};

const categorySpecConfig: Record<string, SpecField[]> = {
  'gaming': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'office': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'graphics': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'student': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'business': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'ultrabook': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'laptop-gaming': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'laptop-van-phong': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],
  'laptop': ['cpu', 'ram', 'storage', 'display', 'gpu', 'os', 'weight', 'battery'],

  'keyboard': ['switchType', 'layout', 'keycapMaterial', 'connection'],
  'ban-phim': ['switchType', 'layout', 'keycapMaterial', 'connection'],

  'mouse': ['maxDPI', 'pollRate', 'buttons', 'weight', 'battery', 'connection'],
  'chuot': ['maxDPI', 'pollRate', 'buttons', 'weight', 'battery', 'connection'],

  'headphone': ['driver', 'frequency', 'impedance', 'cableLength', 'connection'],
  'tai-nghe': ['driver', 'frequency', 'impedance', 'cableLength', 'connection'],

  'cooling-pad': ['type', 'tdp', 'fanSpeed', 'noiseLevel'],
  'tan-nhiet': ['type', 'tdp', 'fanSpeed', 'noiseLevel'],
};

/**
 * Get the specs that should be displayed for a given category
 * @param categoryName - The category name (from DB or slug)
 * @returns Array of spec field keys to display
 */
export function getSpecsForCategory(categoryName: string): SpecField[] {
  if (!categoryName) return categorySpecConfig['gaming'];

  const normalized = categoryName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');

  // Try exact match first
  if (categorySpecConfig[normalized]) {
    return categorySpecConfig[normalized];
  }

  // Try lowercase match
  if (categorySpecConfig[categoryName.toLowerCase()]) {
    return categorySpecConfig[categoryName.toLowerCase()];
  }

  // Check if category name contains known keywords
  const lowerName = categoryName.toLowerCase();
  if (lowerName.includes('laptop') || lowerName.includes('gaming') || lowerName.includes('van-phong') || lowerName.includes('văn phòng')) {
    return categorySpecConfig['gaming'];
  }
  if (lowerName.includes('ban') || lowerName.includes('phim') || lowerName.includes('keyboard')) {
    return categorySpecConfig['ban-phim'];
  }
  if (lowerName.includes('chuot') || lowerName.includes('mouse')) {
    return categorySpecConfig['chuot'];
  }
  if (lowerName.includes('tai') || lowerName.includes('nghe') || lowerName.includes('headphone')) {
    return categorySpecConfig['tai-nghe'];
  }
  if (lowerName.includes('tan') || lowerName.includes('nhiệt') || lowerName.includes('cooler') || lowerName.includes('cooling')) {
    return categorySpecConfig['tan-nhiet'];
  }

  return categorySpecConfig['gaming'];
}

/**
 * Format Vietnamese spec field names by adding spaces
 * Converts "Tìnhtrạng" -> "Tình trạng", "Độdàidây(cm)" -> "Độ dài dây"
 */
function formatVietnameseSpecName(name: string): string {
  // Remove unit annotations like (cm), (%), etc. first
  let cleanName = name.replace(/\s*\([^)]*\)\s*/g, '').trim();

  // Map of common Vietnamese spec field names without spaces
  const vietnameseSpecMap: Record<string, string> = {
    'Tìnhtrạng': 'Tình trạng',
    'Độdàidây': 'Độ dài dây',
    'Sốlượngnútbấm': 'Số lượng nút bấm',
    'Tốidộ': 'Tối độ',
    'Dộcduyệt': 'Độc duyệt',
    'Têntrường': 'Tên trường',
    'Giátrị': 'Giá trị',
    'Kếtnối': 'Kết nối',
    'Loạiswitch': 'Loại switch',
    'Chấtliệukeycap': 'Chất liệu keycap',
    'Led': 'LED',
    'Warranty': 'Bảo hành',
  };

  // Check if exact match in map (with and without units)
  if (vietnameseSpecMap[cleanName]) {
    return vietnameseSpecMap[cleanName];
  }
  if (vietnameseSpecMap[name]) {
    return vietnameseSpecMap[name];
  }

  // For other text, just return as-is if it looks already formatted (has spaces)
  if (name.includes(' ')) {
    return name;
  }

  // For other Vietnamese text without spaces, try to insert spaces intelligently
  const result = cleanName.replace(/([a-z])([A-Z])/g, '$1 $2');
  return result.length > 0 ? result.charAt(0).toUpperCase() + result.slice(1) : name;
}

/**
 * Get the label for a spec field
 */
export function getSpecLabel(field: string | SpecField): string {
  const normalized = field as SpecField;

  // First check if it's in our predefined labels
  if (specLabels[normalized]) {
    return specLabels[normalized];
  }

  // Try to format Vietnamese field names
  const formatted = formatVietnameseSpecName(field);
  if (formatted !== field) {
    return formatted;
  }

  // Fallback: capitalize first letter
  return field.charAt(0).toUpperCase() + field.slice(1);
}

/**
 * Filter specs object based on category
 * @param specs - The full specs object from product
 * @param categoryName - The category name
 * @returns Filtered specs object with only relevant fields
 */
export function filterSpecsByCategory(
  specs: Record<string, any>,
  categoryName: string
): Record<string, string> {
  const relevantFields = getSpecsForCategory(categoryName);
  const filtered: Record<string, string> = {};

  // Add specs that are in the config for this category
  relevantFields.forEach((field) => {
    if (specs[field]) {
      filtered[field] = specs[field];
    }
  });

  // For categories with flexible specs (all non-standard specs), include everything
  const lowerName = categoryName.toLowerCase();
  if (lowerName.includes('ban') || lowerName.includes('phim') || lowerName.includes('keyboard') ||
      lowerName.includes('chuot') || lowerName.includes('mouse') ||
      lowerName.includes('tai') || lowerName.includes('nghe') || lowerName.includes('headphone') ||
      lowerName.includes('tan') || lowerName.includes('nhiệt') || lowerName.includes('cooler')) {
    // For accessory categories, include all specs from the backend
    Object.entries(specs).forEach(([key, value]) => {
      if (value && !filtered[key]) {
        filtered[key] = value;
      }
    });
  }

  return filtered;
}

/**
 * Get all available spec fields for a category in a layout format
 * @param categoryName - The category name
 * @returns Array of spec fields organized for display
 */
export function getSpecsLayout(categoryName: string) {
  const specs = getSpecsForCategory(categoryName);
  const midPoint = Math.ceil(specs.length / 2);
  
  return {
    leftColumn: specs.slice(0, midPoint),
    rightColumn: specs.slice(midPoint),
  };
}
