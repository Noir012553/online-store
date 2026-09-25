const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const LiveTranslationCache = require('../models/LiveTranslationCache');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const REQUIRED_LANGUAGES = ['vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv'];
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

const requestJson = (url, options = {}, body = null) => new Promise((resolve, reject) => {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;
  const payload = body === null ? null : JSON.stringify(body);
  const request = transport.request(parsedUrl, {
    method: options.method || 'GET',
    headers: {
      ...(payload ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      } : {}),
      ...(options.headers || {}),
    },
  }, (response) => {
    let responseBody = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { responseBody += chunk; });
    response.on('end', () => {
      let data = {};
      try {
        data = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        reject(new Error(`Invalid JSON response (HTTP ${response.statusCode})`));
        return;
      }
      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(data);
        return;
      }
      reject(new Error(data.error || `HTTP ${response.statusCode}`));
    });
  });

  request.setTimeout(DEFAULT_TIMEOUT_MS, () => {
    request.destroy(new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`));
  });
  request.on('error', reject);
  if (payload) request.write(payload);
  request.end();
});

const parseArgs = (args) => ({
  json: args.includes('--json'),
  smokeTest: args.includes('--smoke-test'),
});

const addCheck = (checks, name, ok, detail, severity = 'error') => {
  checks.push({ name, ok, detail, severity });
};

const checkConfiguration = () => {
  const checks = [];
  const libreEnabled = process.env.LIBRETRANSLATE_ENABLED === 'true';
  const failoverEnabled = process.env.LIBRETRANSLATE_FAILOVER_ON_CLOUDFLARE_OVERLOAD === 'true';
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
  addCheck(
    checks,
    'LibreTranslate failover guard',
    !failoverEnabled || libreEnabled,
    failoverEnabled && !libreEnabled ? 'failover requires LIBRETRANSLATE_ENABLED=true' : 'configuration consistent',
  );
  addCheck(
    checks,
    'LibreTranslate approval policy',
    true,
    process.env.LIBRETRANSLATE_AS_PRIMARY_APPROVED === 'true'
      ? 'legacy approval flag is ignored; validator controls quality'
      : 'validator controls quality independently of provider',
    'warning',
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
    const libreConcurrency = parsePositiveInteger('LIBRETRANSLATE_MAX_PARALLEL_REQUESTS', 4);
    const delayMs = parseNonNegativeInteger('PRODUCT_TRANSLATION_DELAY_MS', 1000);
    const productLimit = parseNonNegativeInteger('PRODUCT_TRANSLATION_LIMIT', 0);
    const lockTtl = parsePositiveInteger('PRODUCT_TRANSLATION_LOCK_TTL_SECONDS', 120);
    addCheck(checks, 'Product concurrency', true, String(concurrency));
    addCheck(checks, 'Language concurrency', true, String(languageConcurrency));
    addCheck(checks, 'Translation chunk size', true, String(chunkSize));
    addCheck(checks, 'LibreTranslate max parallel requests', true, String(libreConcurrency));
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

  return { checks, libreEnabled, lockMode };
};

const checkRuntimeDependencies = async (checks, lockMode) => {
  if (!process.env.MONGO_URI) {
    addCheck(checks, 'MongoDB connection', false, 'MONGO_URI is not configured');
    addCheck(checks, 'Legacy failover migration', false, 'skipped because MongoDB is unavailable');
  } else {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: DEFAULT_TIMEOUT_MS,
      });
      addCheck(checks, 'MongoDB connection', true, 'connected');

      const legacyCount = await LiveTranslationCache.countDocuments({ status: 'fallback_libretranslate' });
      addCheck(
        checks,
        'Legacy failover migration',
        legacyCount === 0,
        legacyCount === 0 ? 'no legacy status records found' : `${legacyCount} legacy record(s) require migration`,
      );
    } catch (error) {
      addCheck(checks, 'MongoDB connection', false, error.message);
      addCheck(checks, 'Legacy failover migration', false, 'skipped because MongoDB connection failed');
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

const checkLibreTranslate = async (checks, smokeTest, enabled) => {
  if (!enabled) {
    addCheck(
      checks,
      'LibreTranslate endpoint',
      !smokeTest,
      smokeTest ? 'smoke test requires LIBRETRANSLATE_ENABLED=true' : 'skipped because disabled',
      smokeTest ? 'error' : 'warning',
    );
    return;
  }

  const baseUrl = process.env.LIBRETRANSLATE_URL || 'http://127.0.0.1:5001';
  try {
    const languages = await requestJson(`${baseUrl.replace(/\/$/, '')}/languages`);
    const available = new Set((Array.isArray(languages) ? languages : []).map(language => language.code));
    const missing = REQUIRED_LANGUAGES.filter(language => !available.has(language));
    addCheck(
      checks,
      'LibreTranslate languages',
      missing.length === 0,
      missing.length === 0 ? `${REQUIRED_LANGUAGES.length} required languages available` : `missing: ${missing.join(', ')}`,
    );

    if (smokeTest) {
      const result = await requestJson(
        `${baseUrl.replace(/\/$/, '')}/translate`,
        { method: 'POST' },
        {
          q: 'Laptop Gaming Acer Nitro 5 RAM 16GB SSD 512GB RTX 4060',
          source: 'vi',
          target: 'en',
          format: 'text',
          ...(process.env.LIBRETRANSLATE_API_KEY ? { api_key: process.env.LIBRETRANSLATE_API_KEY } : {}),
        },
      );
      addCheck(
        checks,
        'LibreTranslate smoke test',
        typeof result.translatedText === 'string' && result.translatedText.trim() !== '',
        typeof result.translatedText === 'string' ? result.translatedText : 'missing translatedText',
      );
    }
  } catch (error) {
    addCheck(checks, 'LibreTranslate endpoint', false, error.message);
  }
};

const run = async () => {
  const { json, smokeTest } = parseArgs(process.argv.slice(2));
  const { checks, libreEnabled, lockMode } = checkConfiguration();
  await checkLibreTranslate(checks, smokeTest, libreEnabled);
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
