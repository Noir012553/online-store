const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const REQUIRED_LANGUAGES = ['vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv'];
const DEFAULT_TIMEOUT_MS = 5000;

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
  const fallbackEnabled = process.env.LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT === 'true';
  const cloudflareEnabled = process.env.CLOUDFLARE_AI_ENABLED === 'true';

  addCheck(
    checks,
    'Cloudflare credentials',
    !cloudflareEnabled || Boolean(
      (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)
      || (process.env.CLOUDFLARE_ACCOUNT_ID_1 && process.env.CLOUDFLARE_API_TOKEN_1)
    ),
    cloudflareEnabled ? 'credentials configured' : 'Cloudflare disabled',
  );
  addCheck(
    checks,
    'LibreTranslate fallback guard',
    !fallbackEnabled || libreEnabled,
    fallbackEnabled && !libreEnabled ? 'fallback requires LIBRETRANSLATE_ENABLED=true' : 'configuration consistent',
  );
  addCheck(
    checks,
    'LibreTranslate approval policy',
    process.env.LIBRETRANSLATE_AS_PRIMARY_APPROVED !== 'true',
    process.env.LIBRETRANSLATE_AS_PRIMARY_APPROVED === 'true'
      ? 'warning: fallback may be auto-approved'
      : 'fallback remains pending review',
    'warning',
  );

  try {
    const concurrency = parsePositiveInteger('PRODUCT_TRANSLATION_CONCURRENCY', 1);
    const languageConcurrency = parsePositiveInteger('PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY', 1);
    const chunkSize = parsePositiveInteger('PRODUCT_TRANSLATION_CHUNK_SIZE', 10);
    const libreConcurrency = parsePositiveInteger('LIBRETRANSLATE_MAX_PARALLEL_REQUESTS', 4);
    addCheck(checks, 'Product concurrency', true, String(concurrency));
    addCheck(checks, 'Language concurrency', true, String(languageConcurrency));
    addCheck(checks, 'Translation chunk size', true, String(chunkSize));
    addCheck(checks, 'LibreTranslate max parallel requests', true, String(libreConcurrency));
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

  return { checks, libreEnabled };
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
        { q: '16GB RAM laptop', source: 'vi', target: 'en', format: 'text' },
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
  const { checks, libreEnabled } = checkConfiguration();
  await checkLibreTranslate(checks, smokeTest, libreEnabled);

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
