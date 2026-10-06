const fs = require('fs');
const path = require('path');

const FRONTEND_SRC = path.resolve(__dirname, '../../../online-store-frontend/src');
const LOCALES_DIR = path.resolve(__dirname, '../locales');
const DEFAULT_LOCALE = 'vi';
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function readCatalogKeys() {
  const localePath = path.join(LOCALES_DIR, DEFAULT_LOCALE);
  return new Set(fs.readdirSync(localePath)
    .filter((fileName) => fileName.endsWith('.json'))
    .flatMap((fileName) => Object.keys(JSON.parse(fs.readFileSync(path.join(localePath, fileName), 'utf8')))));
}

const catalogKeys = readCatalogKeys();
const calls = new Map();
const callPattern = /(?:^|[^\w$])t\s*\(\s*(['"])([^'"\n]+)\1(?:\s*,\s*(['"])([^'"\n]+)\3)?/g;

for (const filePath of collectSourceFiles(FRONTEND_SRC)) {
  const source = fs.readFileSync(filePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '');
  for (const match of source.matchAll(callPattern)) {
    const key = match[2].trim();
    const namespace = (match[4] || 'common').trim();
    if (key.includes('${') || namespace.includes('${')) continue;
    const callId = `${namespace}:${key}`;
    if (!calls.has(callId)) calls.set(callId, { key, namespace, filePath });
  }
}

const missing = [];
for (const call of calls.values()) {
  if (!catalogKeys.has(call.key)) missing.push(call);
}

console.log(`Checked ${calls.size} static translation calls across ${collectSourceFiles(FRONTEND_SRC).length} source files.`);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} translation key(s):`);
  for (const call of missing) {
    console.error(`- ${call.namespace}:${call.key} (${path.relative(process.cwd(), call.filePath)})`);
  }
  process.exit(1);
}

console.log('All static frontend translation keys exist in the default locale catalogs.');
