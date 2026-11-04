type TechnicalDescriptionEntry = [string, unknown];

const parseTechnicalDescription = (value: string) => {
  const objectStart = value.indexOf('{');
  if (objectStart < 0) return null;

  const heading = value.slice(0, objectStart).trim();
  if (heading && (!/^[^{}\n]+:$/.test(heading))) return null;

  try {
    const parsed: unknown = JSON.parse(value.slice(objectStart));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return {
      heading,
      entries: Object.entries(parsed as Record<string, unknown>) as TechnicalDescriptionEntry[],
    };
  } catch {
    return null;
  }
};

export const formatTechnicalDescription = (value: string): string => {
  const parsed = parseTechnicalDescription(value);
  if (!parsed) return value;

  return [
    parsed.heading,
    ...parsed.entries.map(([key, entryValue]) => `${key}: ${typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue ?? '')}`),
  ].filter(Boolean).join('\n');
};

export const serializeTechnicalDescription = (value: string, referenceValue = ''): string => {
  const reference = parseTechnicalDescription(referenceValue);
  if (!reference || parseTechnicalDescription(value)) return value;

  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return value;

  const heading = lines[0].match(/^(.+?):\s*$/)?.[1] || reference.heading.replace(/:\s*$/, '').trim();
  const entryLines = lines[0].match(/^(.+?):\s*$/) ? lines.slice(1) : lines;
  if (entryLines.length === 0) return heading ? `${heading}: {}` : value;

  const entries: Record<string, unknown> = {};
  const referenceEntries = new Map(reference.entries);
  for (const line of entryLines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 1) return value;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(entries, key)) return value;
    const entryValue = line.slice(separatorIndex + 1).trim();
    if (entryValue.startsWith('{') || entryValue.startsWith('[')) {
      try {
        const parsedValue = JSON.parse(entryValue);
        if (typeof parsedValue === 'object' && parsedValue !== null) return value;
      } catch {
        return value;
      }
    }
    const originalValue = referenceEntries.get(key);
    entries[key] = originalValue !== undefined && String(originalValue ?? '') === entryValue ? originalValue : entryValue;
  }

  return `${heading ? `${heading}: ` : ''}${JSON.stringify(entries)}`;
};
