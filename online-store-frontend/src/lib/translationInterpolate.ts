/**
 * Interpolate variables in translated strings
 * Supports {varName} syntax
 * Example: "Hello {name}" with { name: "John" } => "Hello John"
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
    const pattern = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(pattern, String(value));
  });

  return result;
}
