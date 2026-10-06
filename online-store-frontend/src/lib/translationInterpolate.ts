/**
 * Interpolate variables in translated strings
 * Supports {varName} and {{varName}} syntax
 * Example: "Hello {{name}}" with { name: "John" } => "Hello John"
 */
export function interpolateTranslation(
  text: string,
  variables?: Record<string, string | number>
): string {
  if (!variables || Object.keys(variables).length === 0) {
    return text;
  }

  let result = text;
  Object.entries(variables).forEach(([key, value]) => {
    const valueText = String(value);
    result = result
      .replaceAll(`{{${key}}}`, valueText)
      .replaceAll(`{${key}}`, valueText);
  });

  return result;
}
