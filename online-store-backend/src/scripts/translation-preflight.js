const path = require('node:path');
const mongoose = require('mongoose');
const { createClient } = require('redis');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const DEFAULT_TIMEOUT_MS = 5000;

const parseNonNegativeInteger = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
};

const parsePositiveInteger = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

const parseArgs = (args) => ({
  json: args.includes('--json'),
});

const addCheck = (checks, name, ok, detail, severity = 'error') => {
  checks.push({ name, ok, detail, severity });
};

const checkConfiguration = () => {
  const checks = [];
  const cloudflareEnabled = process.env.CLOUDFLARE_AI_ENABLED === 'true';
  const lockMode = process.env.PRODUCT_SEED_LOCK_MODE || 'redis';

  addCheck(
    checks,
    'Distributed lock mode',
    lockMode !== 'memory',
    lockMode === 'memory' ? 'memory lock is not safe for production rollout' : lockMode,
    lockMode === 'memory' ? 'error' : 'warning',
  );

  addCheck(
    checks,
    'Cloudflare credentials',
    cloudflareEnabled && Boolean(
      (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)
      || (process.env.CLOUDFLARE_ACCOUNT_ID_1 && process.env.CLOUDFLARE_API_TOKEN_1)
    ),
    cloudflareEnabled ? 'credentials configured' : 'Cloudflare must be enabled for product translation',
  );
  try {
    const quotaRequests = parsePositiveInteger('CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY', 0);
    const quotaInputChars = parsePositiveInteger('CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY', 0);
    addCheck(
      checks,
      'Cloudflare request quota',
      !cloudflareEnabled || quotaRequests > 0,
      !cloudflareEnabled ? 'skipped because Cloudflare is disabled' : `${quotaRequests} requests/day`,
    );
    addCheck(
      checks,
      'Cloudflare input quota',
      !cloudflareEnabled || quotaInputChars > 0,
      !cloudflareEnabled ? 'skipped because Cloudflare is disabled' : `${quotaInputChars} chars/day`,
    );
  } catch (error) {
    addCheck(checks, 'Cloudflare quota configuration', false, error.message);
  }

  try {
    const concurrency = parsePositiveInteger('PRODUCT_TRANSLATION_CONCURRENCY', 1);
    const languageConcurrency = parsePositiveInteger('PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY', 1);
    const chunkSize = parsePositiveInteger('PRODUCT_TRANSLATION_CHUNK_SIZE', 10);
    const delayMs = parseNonNegativeInteger('PRODUCT_TRANSLATION_DELAY_MS', 1000);
    const productLimit = parseNonNegativeInteger('PRODUCT_TRANSLATION_LIMIT', 0);
    const lockTtl = parsePositiveInteger('PRODUCT_TRANSLATION_LOCK_TTL_SECONDS', 120);
    addCheck(checks, 'Product concurrency', true, String(concurrency));
    addCheck(checks, 'Language concurrency', true, String(languageConcurrency));
    addCheck(checks, 'Translation chunk size', true, String(chunkSize));
    addCheck(checks, 'Translation delay', true, `${delayMs}ms`);
    addCheck(checks, 'Product translation limit', true, productLimit === 0 ? 'all products' : String(productLimit));
    addCheck(checks, 'Translation lock TTL', true, `${lockTtl}s`);
    addCheck(
      checks,
      'Concurrency rollout guard',
      languageConcurrency === 1 || (concurrency <= 2 && languageConcurrency <= 2),
      languageConcurrency === 1 ? 'single language pool' : 'limited two-by-two rollout',
      'warning',
    );
  } catch (error) {
    addCheck(checks, 'Concurrency configuration', false, error.message);
  }

  return { checks, lockMode };
};

const checkRuntimeDependencies = async (checks, lockMode) => {
  if (!process.env.MONGO_URI) {
    addCheck(checks, 'MongoDB connection', false, 'MONGO_URI is not configured');
  } else {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: DEFAULT_TIMEOUT_MS,
      });
      addCheck(checks, 'MongoDB connection', true, 'connected');

    } catch (error) {
      addCheck(checks, 'MongoDB connection', false, error.message);
    } finally {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
  }

  if (lockMode === 'memory') return;

  const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
    socket: { connectTimeout: DEFAULT_TIMEOUT_MS },
  });
  try {
    await client.connect();
    await client.ping();
    addCheck(checks, 'Redis distributed lock', true, 'connected');
  } catch (error) {
    addCheck(checks, 'Redis distributed lock', false, error.message);
  } finally {
    if (client.isOpen) await client.quit();
  }
};

const run = async () => {
  const { json } = parseArgs(process.argv.slice(2));
  const { checks, lockMode } = checkConfiguration();
  await checkRuntimeDependencies(checks, lockMode);

  const failed = checks.filter(check => !check.ok && check.severity === 'error');
  const warnings = checks.filter(check => !check.ok && check.severity === 'warning');
  const result = {
    ok: failed.length === 0,
    failed: failed.length,
    warnings: warnings.length,
    checks,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    checks.forEach(({ name, ok, detail, severity }) => {
      const marker = ok ? 'PASS' : severity === 'warning' ? 'WARN' : 'FAIL';
      console.log(`[${marker}] ${name}: ${detail}`);
    });
    console.log(`Preflight: ${result.ok ? 'READY' : 'BLOCKED'} (${failed.length} error(s), ${warnings.length} warning(s))`);
  }

  process.exitCode = result.ok ? 0 : 1;
};

run().catch((error) => {
  console.error(`[FAIL] Preflight crashed: ${error.message}`);
  process.exitCode = 1;
});
