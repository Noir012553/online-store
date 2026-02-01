/**
 * Spec Parser - Standardizes product specification values
 * Handles unit conversion, extraction, and context separation
 */

export interface ParsedSpec {
  value: number;
  unit: string;
  context: string;
  originalValue: string;
  displayText: string;
}

/**
 * Standard units for each specification type
 * Only fields with actual units are included
 * Matches backend normalization in productSeeder.js
 *
 * Battery can be either time-based (giờ) or energy-based (mAh/Wh)
 * depending on product type
 */
export const STANDARD_UNITS: Record<string, string> = {
  weight: 'g',
  battery: 'giờ',    // Can also be mAh or Wh (time or energy based)
  impedance: 'Ω',
  driver: 'mm',
  frequency: 'Hz',
  cableLength: 'm',
  tdp: 'W',
  fanSpeed: 'RPM',
  noiseLevel: 'dB',
  ram: 'GB',
  storage: 'GB',
  maxDPI: 'DPI',
  pollRate: 'Hz',
  display: '"',      // Inches
};

/**
 * Unit conversion factors to standard units
 * Matches backend normalization in productSeeder.js
 */
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  weight: {
    'kg': 1000,
    'kilogram': 1000,
    'k': 1000,        // Kilogram shorthand
    'g': 1,
    'gram': 1,
    'mg': 0.001,
    'milligram': 0.001,
    't': 1000000,     // Metric ton (tấn)
    'ton': 1000000,
    'tấn': 1000000,
  },
  battery: {
    // Battery can be time-based (hours) or energy-based (mAh/Wh)
    // These don't convert between each other without power draw info
    'h': 1,
    'hour': 1,
    'hours': 1,
    'giờ': 1,         // Vietnamese for hours
    'tiếng': 1,       // Alternative Vietnamese for hours (colloquial)
    'mah': 1,         // Milliamp-hours (energy-based)
    'mahwh': 1,
    'wh': 1,          // Watt-hours (energy-based)
    'ah': 1,          // Amp-hours (rare, energy-based)
  },
  impedance: {
    'Ω': 1,
    'ohm': 1,
    'ohms': 1,
    'ω': 1,
    'ôm': 1,
  },
  driver: {
    'mm': 1,
    'millimeter': 1,
  },
  frequency: {
    'Hz': 1,
    'hz': 1,
    'kHz': 1000,
    'khz': 1000,
    'MHz': 1000000,
    'mhz': 1000000,
  },
  cableLength: {
    'm': 1,
    'meter': 1,
    'cm': 0.01,
    'centimeter': 0.01,
  },
  tdp: {
    'W': 1,
    'watt': 1,
    'watts': 1,
  },
  fanSpeed: {
    'RPM': 1,
    'rpm': 1,
    'RPS': 1,
    'rps': 1,
  },
  noiseLevel: {
    'dB': 1,
    'db': 1,
  },
  storage: {
    'GB': 1,
    'gb': 1,
    'TB': 1024,
    'tb': 1024,
    'MB': 0.001,
    'mb': 0.001,
  },
  ram: {
    'GB': 1,
    'gb': 1,
    'MB': 0.001,
    'mb': 0.001,
  },
  maxDPI: {
    'DPI': 1,
    'dpi': 1,
    'CPI': 1,
    'cpi': 1,
  },
  pollRate: {
    'Hz': 1,
    'hz': 1,
  },
  display: {
    '"': 1,
    'inch': 1,
    'inches': 1,
  },
};

/**
 * Clean unit text by removing parentheses and joining split parts
 * Handles cases like:
 * - "ti (ếng)" → "tiếng" (rejoin split Vietnamese unit)
 * - "g (iờ)" → "giờ" (detect malformed Vietnamese unit for battery)
 * - "t (iếng)" → "tiếng" (alternative split format)
 * - "h (our)" → "hour" (rejoin split English unit)
 * - "mAh" → "mAh" (energy-based battery unit, kept as-is)
 * - "Wh" → "Wh" (energy-based battery unit, kept as-is)
 */
function cleanUnitText(unit: string): string {
  if (!unit) return unit;

  let cleaned = unit.trim();

  // Handle split Vietnamese battery units like "g (iờ)" → "giờ", "t (iếng)" → "tiếng"
  // These cases indicate malformed data from source where unit is split with parentheses
  // BUT: Only treat as battery time unit if NOT followed by "Ah" or "Wh"
  if (/^g\s*\(\s*i?ờ/i.test(cleaned)) {
    return 'giờ';  // "g (iờ)", "g (ờ)", "g(iờ)" all become "giờ"
  }
  if (/^t\s*\(\s*i?ế[ng]?/i.test(cleaned) && !cleaned.match(/wh|ah|mah/i)) {
    return 'giờ';  // "t (iếng)", "t (iếng)", "t(iếng)" → normalize to "giờ" (NOT if Wh/Ah/mAh)
  }
  if (/^ti\s*\(\s*ế[ng]?/i.test(cleaned)) {
    return 'giờ';  // "ti (ếng)", "ti(ếng)" → normalize to "giờ"
  }

  // Handle split units like "ti (ếng)" → "tiếng", "h (our)" → "hour"
  // Rejoin parts separated by parentheses
  cleaned = cleaned
    .replace(/(\w)\s*\(\s*(\w)/g, '$1$2')  // "ti (ếng)" → "tiếng", "h (our)" → "hour"
    .replace(/\s*\([^)]*\)/g, '')           // Remove any remaining parentheses content
    .replace(/\s+/g, '');                    // Remove spaces

  return cleaned;
}

/**
 * Extract number and unit from a string
 * Handles cases like:
 * - "1068kg", "1.5 kg", "1600g (đi kèm đệm tay)"
 * - "Khoảng 1832g" (approximately)
 * - "~48g" (tilde approximately)
 * - "795 (+10g)" (with additional note)
 * - "643 g" (with spaces)
 * - "95 giờ", "134 tiếng" (Vietnamese time units for battery)
 * - "134 ti (ếng) Bluetooth" (unit split with parentheses)
 * - "30 g (iờ)" (malformed battery unit - should parse as "30 giờ")
 * - "42 t (iếng)" (malformed battery unit - should parse as "42 giờ")
 * - "Kéo dài tới 450 giờ trên ROG SpeedNova Wireless" (long description with number embedded)
 */
function extractNumberAndUnit(text: string): { number: number; unit: string; rest: string } {
  // Trim and normalize text
  let cleanText = text.trim();

  // Remove "Khoảng" prefix (approximately) - case insensitive
  cleanText = cleanText.replace(/^khoảng\s+/i, '');

  // Remove "~" prefix (tilde approximately) - may have spaces after
  cleanText = cleanText.replace(/^~\s*/, '');

  // First, try to find number-unit pair at the start (most common case)
  // Updated to support Vietnamese characters (ư, ơ, ả, etc.) for "giờ" and "tiếng"
  // Also allow parentheses in unit part for cases like "ti (ếng)" and malformed units like "g (iờ)"
  let match = cleanText.match(/^([\d.,]+)\s*([a-zA-Z%°Ωăâêôơưàáảãạèéẻẽẹìíỉĩịòóỏõộờớởỡợùúủũụỳýỷỹỵđ()\s]*?)?\s*(.*)$/i);

  // If no match at start, try to find number-unit pair anywhere in the text
  // Useful for cases like "Kéo dài tới 450 giờ trên ROG..." where number is not at start
  if (!match) {
    const anyMatch = cleanText.match(/([\d.,]+)\s*([a-zA-Z%°Ωăâêôơưàáảãạèéẻẽẹìíỉĩịòóỏõộờớởỡợùúủũụỳýỷỹỵđ()]*)/i);
    if (anyMatch && anyMatch[1]) {
      // Extract from the matched position onward
      const startIndex = cleanText.indexOf(anyMatch[1]);
      const afterNumber = cleanText.substring(startIndex + anyMatch[1].length);
      const unitMatch = afterNumber.match(/^\s*([a-zA-Z%°Ωăâêôơưàáảãạèéẻẽẹìíỉĩịòóỏõộờớởỡợùúủũụỳýỷỹỵđ()]*?)\s*(.*)/i);

      if (unitMatch) {
        const numberStr = anyMatch[1].replace(/,/g, '.');
        const number = parseFloat(numberStr);
        let unit = (unitMatch[1] || '').trim();
        // Clean unit by removing parentheses and spaces
        unit = cleanUnitText(unit);
        const rest = (unitMatch[2] || '').trim();

        return { number, unit, rest };
      }
    }

    return { number: NaN, unit: '', rest: cleanText };
  }

  const numberStr = match[1].replace(/,/g, '.');
  const number = parseFloat(numberStr);
  let unit = (match[2] || '').trim();
  // Clean unit by removing parentheses and spaces
  unit = cleanUnitText(unit);
  const rest = (match[3] || '').trim();

  return { number, unit, rest };
}

/**
 * Extract context from the remaining string
 * Removes parentheses and returns the cleaned text
 * Handles cases like:
 * - "(+10g)" → extracted
 * - "(±15%)" → extracted
 * - "(- 21 Hz)" → extracted
 * - "(bao gồm dây)" → extracted
 * - "+10g" without parentheses → extracted
 */
function extractContext(text: string): string {
  if (!text) return '';

  // Try to extract from parentheses first
  const parenMatch = text.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    let content = parenMatch[1].trim();

    // Accept content that contains operators (+, -, ±, %) or actual text
    // Filter out pure unit strings like "(g)", "(kg)"
    if (!/^[a-zA-Z°Ω]+$/.test(content)) {
      return content;
    }
  }

  // For remaining text without parentheses
  const withoutParens = text.replace(/\([^)]*\)/g, '').trim();
  if (withoutParens && !/^[a-zA-Z°Ω]+$/.test(withoutParens)) {
    return withoutParens;
  }

  return '';
}

/**
 * Normalize unit text (e.g., "Ohm" → "Ω", "ghz" → "GHz")
 * Aligns with backend normalization from productSeeder.js
 * Handles malformed units like "g (iờ)", "t (iếng)" for battery specs
 */
function normalizeUnit(unit: string): string {
  if (!unit) return unit;

  // Clean the unit first (handles joined text from parentheses)
  const cleanedUnit = cleanUnitText(unit);

  // Normalize common unit variations
  // Backend standardizes to: g, giờ/mAh/Wh, Ω, mm, Hz, m, W, RPM, dB, GB, DPI, "
  const unitMap: Record<string, string> = {
    // Weight (normalized to grams by backend, but may receive other units)
    'kg': 'kg',
    'kilogram': 'kg',
    'k': 'k',           // Kilogram shorthand
    'g': 'g',
    'gram': 'g',
    'mg': 'mg',
    'milligram': 'mg',
    't': 't',           // Metric ton
    'ton': 't',
    'tấn': 't',

    // Battery - can be time-based (giờ/h) or energy-based (mAh/Wh)
    'h': 'giờ',
    'hour': 'giờ',
    'hours': 'giờ',
    'giờ': 'giờ',
    'tiếng': 'giờ',
    'mah': 'mAh',
    'mahwh': 'mAh',
    'wh': 'Wh',
    'ah': 'Ah',
    // Malformed battery units (these should be caught by cleanUnitText already)
    'g(iờ)': 'giờ',
    'giờ)': 'giờ',
    't(iếng)': 'giờ',
    'tiếng)': 'giờ',

    // Impedance
    'ohm': 'Ω',
    'ohms': 'Ω',
    'ω': 'Ω',
    'ôm': 'Ω',

    // Driver
    'mm': 'mm',
    'millimeter': 'mm',

    // Frequency
    'hz': 'Hz',
    'khz': 'kHz',
    'mhz': 'MHz',
    'ghz': 'GHz',

    // Cable length
    'm': 'm',
    'meter': 'm',
    'cm': 'cm',
    'centimeter': 'cm',

    // TDP
    'w': 'W',
    'watt': 'W',
    'watts': 'W',

    // Fan speed
    'rpm': 'RPM',
    'rps': 'RPS',

    // Noise
    'db': 'dB',

    // Storage/RAM
    'gb': 'GB',
    'tb': 'TB',
    'mb': 'MB',

    // DPI
    'dpi': 'DPI',
    'cpi': 'CPI',

    // Display (inches)
    '"': '"',
    'inch': '"',
    'inches': '"',
  };

  // Use cleaned unit for lookup (handles malformed units like "g (iờ)" → "giờ")
  const lowerUnit = cleanedUnit.toLowerCase().trim();
  return unitMap[lowerUnit] || cleanedUnit;
}

/**
 * Convert value to standard unit based on spec field type
 */
function convertToStandardUnit(
  value: number,
  unit: string,
  specField: string
): { value: number; unit: string } {
  // Normalize unit first
  const normalizedInputUnit = normalizeUnit(unit);

  const conversionMap = UNIT_CONVERSIONS[specField];
  if (!conversionMap) {
    return { value, unit: normalizedInputUnit };
  }

  const normalizedUnit = Object.keys(conversionMap).find(
    (u) => u.toLowerCase() === normalizedInputUnit.toLowerCase()
  );

  if (normalizedUnit && conversionMap[normalizedUnit]) {
    const conversionFactor = conversionMap[normalizedUnit];
    const standardUnit = STANDARD_UNITS[specField] || normalizedInputUnit;
    return {
      value: value * conversionFactor,
      unit: standardUnit,
    };
  }

  // If no conversion found, return normalized unit
  return { value, unit: normalizedInputUnit as string };
}

/**
 * Format a number with appropriate decimal places
 */
function formatNumber(value: number, decimals: number = 2): string {
  if (Number.isNaN(value)) return '';

  // If it's a whole number, return without decimals
  if (Number.isInteger(value)) {
    return value.toString();
  }

  // Otherwise, show up to specified decimal places, removing trailing zeros
  return parseFloat(value.toFixed(decimals))
    .toString()
    .replace(/\.?0+$/, '');
}

/**
 * Parse and standardize a specification value
 * @param specValue - The raw spec value (e.g., "1068kg (bao gồm dây)")
 * @param specField - The spec field type (e.g., "weight", "battery")
 * @returns Parsed spec with standardized values
 */
export function parseSpec(
  specValue: string | number,
  specField: string
): ParsedSpec {
  const originalValue = specValue.toString();

  // Extract number and unit
  const { number, unit, rest } = extractNumberAndUnit(originalValue);

  if (Number.isNaN(number)) {
    // If no number found, treat the whole value as a non-numeric spec (like "AIO Liquid", "Mechanical")
    const defaultUnit = STANDARD_UNITS[specField] || '';
    return {
      value: NaN,
      unit: defaultUnit,
      context: '',
      originalValue,
      displayText: defaultUnit ? `${originalValue}` : originalValue,
    };
  }

  // Extract context (e.g., "bao gồm dây", "đi kèm đệm tay")
  const context = extractContext(rest);

  // Convert to standard unit
  const { value: standardValue, unit: standardUnit } = convertToStandardUnit(
    number,
    unit,
    specField
  );

  // Build display text - show only value and unit, no context/parentheses
  // Use default unit if parsing didn't extract one
  const finalUnit = standardUnit || STANDARD_UNITS[specField] || '';
  const displayText = finalUnit
    ? `${formatNumber(standardValue)} ${finalUnit}`
    : formatNumber(standardValue);

  return {
    value: standardValue,
    unit: finalUnit,
    context,
    originalValue,
    displayText,
  };
}

/**
 * Parse multiple spec values and deduplicate similar ones
 * Useful for filters to show standardized options
 */
export function parseAndGroupSpecs(
  specValues: string[],
  specField: string
): Array<{ parsed: ParsedSpec; original: string }> {
  const parsed = specValues.map((value) => ({
    parsed: parseSpec(value, specField),
    original: value,
  }));

  // Sort by numeric value
  parsed.sort((a, b) => {
    const aNum = a.parsed.value || 0;
    const bNum = b.parsed.value || 0;
    return aNum - bNum;
  });

  return parsed;
}

/**
 * Get translated spec context
 * Translates common Vietnamese context phrases to English
 * For battery specs, filters out lengthy product-specific contexts
 */
function getTranslatedContext(context: string): string {
  const contextMap: Record<string, string> = {
    'bao gồm dây': 'including cable',
    'bao gồm ko dây': 'without wireless',
    'đi kèm đệm tay': 'with hand cushion',
    'không đi kèm': 'not included',
    'có dây': 'with cable',
    'không dây': 'wireless',
    'có': 'yes',
    'không': 'no',
  };

  const lower = context.toLowerCase().trim();
  return contextMap[lower] || context;
}

/**
 * Filter out unnecessary battery context for cleaner display
 * Removes product names, model names, and long descriptions
 */
function shouldExcludeBatteryContext(context: string): boolean {
  if (!context) return false;

  // Exclude context that contains product names or model names
  // Patterns: "trên ...", "cho ...", "dành cho ...", "model ...", "(Bluetooth)" etc.
  const excludePatterns = [
    /trên\s+\w+/i,              // "trên ROG SpeedNova Wireless"
    /cho\s+\w+/i,               // "cho X model"
    /dành\s+cho/i,              // "dành cho ..."
    /model/i,
    /\bseries\b/i,
    /\bversion\b/i,
    /bluetooth/i,               // "(Bluetooth)" - not needed for filter display
    /wireless/i,                // "Wireless" info
    /dây|cable/i,               // Cable type - not needed for filter
  ];

  return excludePatterns.some(pattern => pattern.test(context));
}

/**
 * Format spec for filter display (standardized and clean)
 * Designed to work with normalized backend data (e.g., "1500g", "95 giờ", "32 Ω")
 */
export function formatSpecForFilter(
  specValue: string | number,
  specField: string,
  includeContext: boolean = true
): string {
  const parsed = parseSpec(specValue, specField);

  if (Number.isNaN(parsed.value)) {
    // For non-numeric values (like "Mechanical Switch", "Wireless"), return as-is
    // These are already properly formatted from the backend
    return parsed.originalValue;
  }

  // Format numeric values with unit
  const unit = parsed.unit || STANDARD_UNITS[specField] || '';
  const display = unit
    ? `${formatNumber(parsed.value)} ${unit}`
    : formatNumber(parsed.value);

  // For battery specs, exclude long product-specific context (e.g., "trên ROG SpeedNova Wireless")
  if (includeContext && parsed.context && specField === 'battery' && shouldExcludeBatteryContext(parsed.context)) {
    // Don't include this context - product names are too verbose for filters
    return display;
  }

  if (includeContext && parsed.context) {
    const translatedContext = getTranslatedContext(parsed.context);
    return `${display} (${translatedContext})`;
  }

  return display;
}

/**
 * Group filter values by numeric value + unit (ignoring context)
 * Useful to show unique specifications without duplication from different contexts
 */
export function deduplicateSpecFilters(
  specValues: string[],
  specField: string
): Array<{ value: string; displayText: string }> {
  const parsed = parseAndGroupSpecs(specValues, specField);
  const seen = new Set<string>();
  const result: Array<{ value: string; displayText: string }> = [];

  parsed.forEach(({ parsed: spec, original }) => {
    // Group by value + unit, so different contexts don't create duplicates
    const key = `${spec.value}${spec.unit}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        value: original,
        displayText: formatSpecForFilter(original, specField, true),
      });
    }
  });

  return result;
}
