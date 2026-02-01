import { Slider } from './ui/slider';

interface SpecRangeFilterProps {
  label: string;
  specField: string;
  minValue: number;
  maxValue: number;
  step: number;
  unit: string;
  currentMin: number;
  currentMax: number;
  onRangeChange: (min: number, max: number) => void;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return parseFloat(value.toFixed(2))
    .toString()
    .replace(/\.?0+$/, '');
}

export function SpecRangeFilter({
  label,
  specField,
  minValue,
  maxValue,
  step,
  unit,
  currentMin,
  currentMax,
  onRangeChange,
}: SpecRangeFilterProps) {
  const displayMin = currentMin || minValue;
  const displayMax = currentMax || maxValue;

  return (
    <div className="spec-range-filter">
      <h4 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
        {label}
      </h4>
      <div className="space-y-4">
        <Slider
          min={minValue}
          max={maxValue}
          step={step}
          value={[displayMin, displayMax]}
          onValueChange={(values) => onRangeChange(values[0], values[1])}
          className="mt-2"
        />
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-gray-700">
            <span>Tối thiểu</span>
            <span>Tối đa</span>
          </div>
          <div className="flex justify-between text-sm text-gray-900 font-semibold">
            <span className="text-red-600">
              {formatNumber(displayMin)}{unit}
            </span>
            <span className="text-red-600">
              {formatNumber(displayMax)}{unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
