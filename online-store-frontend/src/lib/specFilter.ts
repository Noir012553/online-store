/**
 * Spec Filter Utils - Helper functions for classifying and filtering specs
 * Determines which specs should use range sliders vs checkboxes
 */

import { STANDARD_UNITS, parseSpec } from './specParser';

export type SpecFilterType = 'range' | 'checkbox';

/**
 * Determine if a spec should use a range slider or checkboxes
 * Specs with units are numeric and use sliders
 * Non-numeric specs use checkboxes
 */
export function getSpecFilterType(specField: string): SpecFilterType {
  const hasUnit = specField in STANDARD_UNITS;
  return hasUnit ? 'range' : 'checkbox';
}

/**
 * Get the standard unit for a spec field
 */
export function getSpecUnit(specField: string): string {
  return STANDARD_UNITS[specField] || '';
}

/**
 * Separate specs into range-based and checkbox-based
 */
export function separateSpecsByType(specFields: string[]): {
  rangeSpecs: string[];
  checkboxSpecs: string[];
} {
  const rangeSpecs: string[] = [];
  const checkboxSpecs: string[] = [];

  specFields.forEach((field) => {
    if (getSpecFilterType(field) === 'range') {
      rangeSpecs.push(field);
    } else {
      checkboxSpecs.push(field);
    }
  });

  return { rangeSpecs, checkboxSpecs };
}

/**
 * Calculate min and max values from spec values
 */
export function calculateSpecRangeStats(
  specValues: string[],
  specField: string
): { minValue: number; maxValue: number; unit: string } {
  let minValue = Infinity;
  let maxValue = 0;

  specValues.forEach((value: string) => {
    const parsed = parseSpec(value, specField);
    if (!Number.isNaN(parsed.value)) {
      if (parsed.value < minValue) minValue = parsed.value;
      if (parsed.value > maxValue) maxValue = parsed.value;
    }
  });

  const unit = getSpecUnit(specField);

  return {
    minValue: minValue === Infinity ? 0 : minValue,
    maxValue: maxValue === 0 ? 0 : maxValue,
    unit,
  };
}

/**
 * Get appropriate step value for slider based on spec field
 * Ensures smooth interaction and reasonable granularity
 */
export function getSpecSliderStep(specField: string): number {
  // Define step sizes for different spec types
  const stepMap: Record<string, number> = {
    weight: 10,              // grams: step by 10g
    battery: 1,              // hours/mAh/Wh: step by 1
    impedance: 1,            // Ω: step by 1
    driver: 0.5,             // mm: step by 0.5mm
    frequency: 10,           // Hz: step by 10Hz
    cableLength: 0.1,        // meters: step by 0.1m
    tdp: 5,                  // Watts: step by 5W
    fanSpeed: 100,           // RPM: step by 100 RPM
    noiseLevel: 1,           // dB: step by 1dB
    ram: 0.5,                // GB: step by 0.5GB
    storage: 10,             // GB: step by 10GB
    maxDPI: 100,             // DPI: step by 100
    pollRate: 10,            // Hz: step by 10Hz
    display: 0.1,            // inches: step by 0.1"
  };

  return stepMap[specField] || 1;
}

/**
 * Format range display text with unit
 */
export function formatRangeDisplay(
  minValue: number,
  maxValue: number,
  unit: string
): string {
  const formatNumber = (value: number): string => {
    if (Number.isInteger(value)) return value.toString();
    return parseFloat(value.toFixed(2))
      .toString()
      .replace(/\.?0+$/, '');
  };

  if (!unit) return `${formatNumber(minValue)} - ${formatNumber(maxValue)}`;
  return `${formatNumber(minValue)}${unit} - ${formatNumber(maxValue)}${unit}`;
}

/**
 * Check if a value falls within a range
 * Used for client-side range filtering
 */
export function isValueInRange(
  specValue: string,
  specField: string,
  minRange: number,
  maxRange: number
): boolean {
  const parsed = parseSpec(specValue, specField);

  if (Number.isNaN(parsed.value)) return false;

  return parsed.value >= minRange && parsed.value <= maxRange;
}
