const fs = require('node:fs/promises');
const process = require('node:process');
const { LibreTranslateClient } = require('./libretranslateClient');
const { translateProducts } = require('./productTranslator');

const usage = `Usage: node src/cli.js --input products.json --output translated.json --source vi --target en

Options:
  --input PATH                 JSON file, or - for stdin
  --output PATH                JSON file, or - for stdout (default)
  --source CODE                Source language (default: vi)
  --target CODE                Target language
  --url URL                    LibreTranslate base URL
  --timeout-ms NUMBER          Request timeout (default: 30000)
  --retries NUMBER             Retries for transient failures (default: 2)
  --concurrency NUMBER         Products translated in parallel (default: 1)
  --description-chunk-size N   Maximum description chunk size (default: 6000)
`;

const parseArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const key = argument.slice(2).replaceAll('-', '_');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key.replaceAll('_', '-')}`);
    options[key] = value;
    index += 1;
  }
  return options;
};

const readJson = async (inputPath) => {
  const content = inputPath === '-' ? await readStdin() : await fs.readFile(inputPath, 'utf8');
  return JSON.parse(content);
};

const readStdin = () => new Promise((resolve, reject) => {
  let content = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { content += chunk; });
  process.stdin.on('end', () => resolve(content));
  process.stdin.on('error', reject);
});

const getProducts = (payload) => {
  if (Array.isArray(payload)) return { products: payload, wrap: (items) => items };
  if (Array.isArray(payload?.products)) return { products: payload.products, wrap: (items) => ({ ...payload, products: items }) };
  return { products: [payload], wrap: (items) => items[0] };
};

const writeJson = async (outputPath, payload) => {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputPath === '-') {
    process.stdout.write(serialized);
  } else {
    await fs.writeFile(outputPath, serialized, 'utf8');
  }
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  if (!args.input) throw new Error('--input is required');
  if (!args.target) throw new Error('--target is required');

  const payload = await readJson(args.input);
  const { products, wrap } = getProducts(payload);
  if (!products.every((product) => product && typeof product === 'object' && !Array.isArray(product))) {
    throw new Error('Input must contain product objects');
  }

  const options = {
    client: new LibreTranslateClient({
      baseUrl: args.url,
      timeoutMs: args.timeout_ms === undefined ? undefined : Number(args.timeout_ms),
      retries: args.retries === undefined ? undefined : Number(args.retries),
    }),
    sourceLang: args.source || process.env.LIBRETRANSLATE_SOURCE_LANG || 'vi',
    targetLang: args.target,
    concurrency: Number(args.concurrency || process.env.LIBRETRANSLATE_CONCURRENCY || 1),
    descriptionChunkSize: Number(args.description_chunk_size || process.env.LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE || 6000),
  };

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error('--concurrency must be a positive integer');
  if (!Number.isInteger(options.descriptionChunkSize) || options.descriptionChunkSize < 1) throw new Error('--description-chunk-size must be a positive integer');

  console.error(`Translating ${products.length} product(s): ${options.sourceLang} -> ${options.targetLang}`);
  const translated = await translateProducts(products, options);
  await writeJson(args.output || '-', wrap(translated));
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { getProducts, parseArgs };
