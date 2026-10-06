/**
 * Flatten nested JSON object to dot-notation keys
 * { a: { b: 'value' } } => { 'a.b': 'value' }
 */
function flattenJson(obj, prefix = '') {
  const flattened = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, flattenJson(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }
  }

  return flattened;
}

/**
 * Unflatten dot-notation keys back to nested object
 * { 'a.b': 'value' } => { a: { b: 'value' } }
 */
function unflattenJson(obj) {
  const unflattened = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const parts = key.split('.');
      let current = unflattened;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      current[parts[parts.length - 1]] = obj[key];
    }
  }

  return unflattened;
}

module.exports = { flattenJson, unflattenJson };
