const axios = require('axios');
const crypto = require('crypto');
const { isSupportedLanguage, getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const LOCALIZATION_SYSTEM_PROMPT = `You are a translator for e-commerce products.

KEY RULES:
1. Preserve technical specs and numbers exactly (e.g., "16GB", "1TB", "i7")
2. Do NOT translate HTML tags, only text content
3. Keep brand names unchanged
4. Return ONLY translated text, NO explanations
5. Preserve formatting and line breaks
6. Do NOT leave Vietnamese words or sentences in the translation, except brand names, model names, and technical identifiers

IMPORTANT:
- Chính hãng → Official/Genuine
- Stock numbers, CPU/RAM/storage specs → Keep unchanged
- Professional, formal tone for products`;

const EMPTY_TRANSLATION_RESPONSE = /^there is no text provided\.\s*please paste the text you would like me to translate\.?$/i;
const stripTranslationPrefix = (text) => text
  .replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '')
  .trim();
const RATE_LIMIT_STATUS_CODES = new Set([420, 429]);
const parseNonNegativeInteger = (name, fallback = 0) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};
const getMaxOutputTokens = () => {
  const raw = process.env.CLOUDFLARE_AI_MAX_TOKENS;
  if (raw === undefined || raw === '') return 2048;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('CLOUDFLARE_AI_MAX_TOKENS must be a positive integer');
  }
  return value;
};

const isRateLimitOrQuotaError = (error) => {
  if (RATE_LIMIT_STATUS_CODES.has(error.response?.status)) return true;

  const providerErrors = Array.isArray(error.response?.data?.errors)
    ? error.response.data.errors
    : [];
  const messages = [
    error.message,
    error.response?.data?.message,
    ...providerErrors.map((entry) => entry?.message),
  ].filter(Boolean).join(' ');

  return /rate[\s-]?limit|quota|too many requests/i.test(messages);
};

class SimpleQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

class CloudflareAiService {
  constructor() {
    this.configs = this._loadConfigs();
    this.configIndex = 0;
    this.updateCurrentConfig();

    // Rate limiting config
    this.maxRequestsPerSecond = parseInt(process.env.CLOUDFLARE_MAX_REQUESTS_PER_SEC || '5');
    this.queue = new SimpleQueue(3);
    this.lastRequestTime = 0;
    this.requestTimestamps = [];
    this.usageDay = null;
    this.usageRequests = 0;
    this.usageInputChars = 0;

    // Idempotency cache (in-memory, prevents duplicate requests)
    this.pendingRequests = new Map();

    // Periodic health check logging (every 30 minutes)
    this.setupPeriodicLogging();
  }

  setupPeriodicLogging() {
    const interval = setInterval(() => {
      const stats = this.getStats();
      const health = this.getHealth();
      console.log(`[CloudflareAI] ${CLI_SYMBOLS.chart} Periodic Health Check:`, {
        status: health.status,
        totalConfigs: stats.totalConfigs,
        currentConfig: stats.currentConfig,
        timestamp: new Date().toISOString(),
        configs: stats.configs.map(c => ({
          index: c.index,
          requests: c.requestCount,
          errors: c.errorCount,
        })),
      });
    }, 30 * 60 * 1000); // 30 minutes
    interval.unref();
  }

  _loadConfigs() {
    const configs = [];
    const envKeys = Object.keys(process.env);
    const numberedConfigIndexes = [...new Set(envKeys
      .filter(key => /^CLOUDFLARE_(ACCOUNT_ID|API_TOKEN|AI_MODEL)_\d+$/.test(key))
      .map(key => Number(key.match(/\d+$/)[0])))]
      .sort((left, right) => left - right);

    if (numberedConfigIndexes.length === 0) {
      const fallbackAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const fallbackToken = process.env.CLOUDFLARE_API_TOKEN;
      const fallbackModel = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3-8b-instruct';

      if (fallbackAccountId && fallbackToken) {
        configs.push({
          index: 1,
          accountId: fallbackAccountId,
          apiToken: fallbackToken,
          model: fallbackModel,
          baseUrl: `https://api.cloudflare.com/client/v4/accounts/${fallbackAccountId}/ai/run/${fallbackModel}`,
          requestCount: 0,
          errorCount: 0,
          lastError: null,
          lastErrorTime: null,
        });
      }
      return configs;
    }

    const maxIndex = Math.max(...numberedConfigIndexes);

    for (let i = 1; i <= maxIndex; i++) {
      const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID_${i}`];
      const apiToken = process.env[`CLOUDFLARE_API_TOKEN_${i}`];
      const configuredModel = process.env[`CLOUDFLARE_AI_MODEL_${i}`];
      const model = configuredModel || '@cf/meta/llama-3-8b-instruct';
      const hasAnyConfig = Boolean(accountId || apiToken || configuredModel);

      if (!hasAnyConfig) {
        throw new Error(`CLOUDFLARE_CONFIG_GROUP_GAP: account ${i}`);
      }
      if (!accountId || !apiToken) {
        throw new Error(`CLOUDFLARE_CONFIG_GROUP_INCOMPLETE: account ${i}`);
      }

      configs.push({
        index: i,
        accountId,
        apiToken,
        model,
        baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        requestCount: 0,
        errorCount: 0,
        lastError: null,
        lastErrorTime: null,
      });
    }

    return configs;
  }

  updateCurrentConfig() {
    if (this.configs.length === 0) {
      this.accountId = null;
      this.apiToken = null;
      this.model = null;
      this.baseUrl = null;
      this.currentConfig = { index: null, requestCount: 0, errorCount: 0 };
      return;
    }
    const config = this.configs[this.configIndex];
    this.accountId = config.accountId;
    this.apiToken = config.apiToken;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.currentConfig = config;
  }

  rotateConfig() {
    if (this.configs.length === 1) return; // No rotation needed if only one config

    this.configIndex = (this.configIndex + 1) % this.configs.length;
    this.updateCurrentConfig();
    console.log(`[CloudflareAI] ${CLI_SYMBOLS.progress} Rotated to config #${this.currentConfig.index}`);
  }

  validate() {
    if (!this.accountId || !this.apiToken) {
      throw new Error(
        'Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID_1/2/... in .env'
      );
    }
  }

  async throttle() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 1000);

    if (this.requestTimestamps.length >= this.maxRequestsPerSecond) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 1000 - (now - oldestRequest) + 10;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle();
    }

    this.requestTimestamps.push(now);
  }

  getIdempotencyKey(text, targetLang, draftText = '') {
    return crypto.createHash('md5').update(`${text}:${targetLang}:${draftText}`).digest('hex');
  }

  getUsagePolicy() {
    return {
      enabled: process.env.CLOUDFLARE_AI_ENABLED === 'true',
      maxRequestsPerDay: parseNonNegativeInteger('CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY'),
      maxInputCharsPerDay: parseNonNegativeInteger('CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY'),
    };
  }

  resetUsageIfNeeded() {
    const day = new Date().toISOString().slice(0, 10);
    if (this.usageDay !== day) {
      this.usageDay = day;
      this.usageRequests = 0;
      this.usageInputChars = 0;
    }
  }

  reserveUsage(inputChars) {
    const policy = this.getUsagePolicy();
    if (!policy.enabled) throw new Error('CLOUDFLARE_AI_DISABLED');
    if (policy.maxRequestsPerDay <= 0 || policy.maxInputCharsPerDay <= 0) {
      throw new Error('CLOUDFLARE_AI_BUDGET_NOT_CONFIGURED');
    }
    this.resetUsageIfNeeded();
    if (this.usageRequests + 1 > policy.maxRequestsPerDay) {
      throw new Error('CLOUDFLARE_AI_REQUEST_BUDGET_EXCEEDED');
    }
    if (this.usageInputChars + inputChars > policy.maxInputCharsPerDay) {
      throw new Error('CLOUDFLARE_AI_INPUT_BUDGET_EXCEEDED');
    }
    this.usageRequests += 1;
    this.usageInputChars += inputChars;
  }

  async translate(text, sourceLang, targetLang, signal = null, retries = 3, baseDelay = 2000, options = {}) {
    // Validate required parameters
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('Translation text must be a non-empty string');
    }
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }
    if (!targetLang) {
      throw new Error('Target language (targetLang) is required');
    }
    if (sourceLang === targetLang) return text;
    const draftText = typeof options?.draftText === 'string' ? options.draftText.trim() : '';
    const idempotencyKey = this.getIdempotencyKey(text, targetLang, draftText);

    if (this.pendingRequests.has(idempotencyKey)) {
      return this.pendingRequests.get(idempotencyKey);
    }

    const promise = this.queue.add(async () => {
      return this._doTranslate(text, sourceLang, targetLang, signal, retries, baseDelay, new Set(), true, draftText);
    });

    this.pendingRequests.set(idempotencyKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(idempotencyKey);
    }
  }

  async _doTranslate(
    text,
    sourceLang,
    targetLang,
    signal = null,
    retries = 3,
    baseDelay = 2000,
    attemptedConfigIndexes = new Set(),
    enforceBudget = false,
    draftText = '',
  ) {
    // Validate required parameters
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }
    if (!targetLang) {
      throw new Error('Target language (targetLang) is required');
    }
    try {
      this.validate();

      if (!isSupportedLanguage(targetLang)) {
        const supportedLangs = getActiveLangCodes().join(', ');
        throw new Error(`Unsupported target language: ${targetLang}. Supported languages: ${supportedLangs}`);
      }

      if (sourceLang === targetLang) {
        return text;
      }

      await this.throttle();
      if (enforceBudget) this.reserveUsage(text.length);

      const startTime = Date.now();
      const response = await axios.post(
        this.baseUrl,
        {
          messages: [
            {
              role: 'system',
              content: LOCALIZATION_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: draftText
                ? `Translate this original text to ${targetLang}. A LibreTranslate draft is included only as a reference. Correct any errors and return only the final translation.\n\nOriginal text:\n${text}\n\nLibreTranslate draft:\n${draftText}`
                : `Translate this text to ${targetLang}:\n\n${text}`,
            },
          ],
          max_tokens: getMaxOutputTokens(),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
          signal,
        }
      );

      const duration = Date.now() - startTime;

      if (response.data.success === false) {
        throw new Error(`Cloudflare AI error: ${response.data.errors?.[0]?.message || 'Unknown error'}`);
      }

      let translatedText = response.data.result?.response || '';

      // Ensure translatedText is a string
      if (typeof translatedText !== 'string') {
        translatedText = String(translatedText || '');
      }

      const normalizedTranslation = stripTranslationPrefix(translatedText);

      if (!normalizedTranslation || EMPTY_TRANSLATION_RESPONSE.test(normalizedTranslation)) {
        throw new Error('No usable translation returned from Cloudflare API');
      }

      this.currentConfig.requestCount++;
      console.log(`[CloudflareAI] ${CLI_SYMBOLS.success} Translation success: { textLength: ${text.length}, sourceLang: '${sourceLang}', targetLang: '${targetLang}', duration: '${duration}ms', config: '#${this.currentConfig.index}/${this.configs.length}', totalRequests: ${this.currentConfig.requestCount} }`);

      return normalizedTranslation;
    } catch (error) {
      // Detect DNS and network failures for retry classification
      const isDnsError =
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN' ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('getaddrinfo');

      const isNetworkUnreachable =
        error.code === 'ENETUNREACH' ||
        error.message?.includes('ENETUNREACH');

      if (isDnsError || isNetworkUnreachable) {
        console.warn('[CloudflareAI] Network error - API unavailable:', {
          error: error.message,
          code: error.code,
        });
      }

      const isRateLimited = isRateLimitOrQuotaError(error);

      if (isRateLimited) {
        this.currentConfig.errorCount++;
        this.currentConfig.lastError = `Rate limited or quota exhausted (${error.response?.status || 'provider message'})`;
        this.currentConfig.lastErrorTime = new Date();

        const attemptedConfigs = new Set(attemptedConfigIndexes);
        attemptedConfigs.add(this.currentConfig.index);
        if (this.configs.length > 1 && attemptedConfigs.size < this.configs.length) {
          this.rotateConfig();
          console.warn(`[CloudflareAI] ${CLI_SYMBOLS.progress} Rate limit or quota hit - switched to config #${this.currentConfig.index}`);
          return this._doTranslate(
            text,
            sourceLang,
            targetLang,
            signal,
            retries,
            baseDelay,
            attemptedConfigs,
            enforceBudget,
            draftText,
          );
        }

        if (this.configs.length > 1) {
          console.error(`[CloudflareAI] ${CLI_SYMBOLS.error} All Cloudflare configurations are rate limited or out of quota`);
          throw error;
        }
      }

      // Retry transient network, rate limit, timeout, and server errors
      const isServerError = error.response?.status >= 500 && error.response?.status < 600;
      const isRetryable = (
        isDnsError ||
        isNetworkUnreachable ||
        isRateLimited ||
        isServerError ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('timeout') ||
        error.message?.includes('canceled')
      );

      if (retries > 0 && isRetryable) {
        const retriesUsed = 3 - retries;
        // For server errors (5xx), use longer exponential backoff
        const serverErrorMultiplier = isServerError ? 2 : 1;
        const exponentialDelay = baseDelay * Math.pow(2, retriesUsed) * serverErrorMultiplier;

        console.warn(`[CloudflareAI] ${CLI_SYMBOLS.warning} Retry (${retries} left) - waiting ${exponentialDelay}ms`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          retryCount: retriesUsed,
          nextDelay: `${exponentialDelay}ms`,
        });
        await new Promise(resolve => setTimeout(resolve, exponentialDelay));
        return this._doTranslate(text, sourceLang, targetLang, signal, retries - 1, baseDelay, attemptedConfigIndexes, enforceBudget, draftText);
      }

      console.error(`[CloudflareAI] ${CLI_SYMBOLS.error} Translation failed (exhausted retries):`, {
        textLength: text.length,
        targetLang,
        error: error.message,
        code: error.code,
        status: error.response?.status,
        headers: error.response?.headers,
      });

      throw error;
    }
  }

  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      queueLength: this.queue.queue.length,
      requestsPerSecond: this.maxRequestsPerSecond,
      usageDay: this.usageDay,
      usageRequests: this.usageRequests,
      usageInputChars: this.usageInputChars,
      currentConfig: this.currentConfig.index,
      totalConfigs: this.configs.length,
      configs: this.configs.map(c => ({
        index: c.index,
        requestCount: c.requestCount,
        errorCount: c.errorCount,
        lastError: c.lastError,
        lastErrorTime: c.lastErrorTime,
      })),
    };
  }

  getHealth() {
    const stats = this.getStats();
    const allConfigs = stats.configs;
    const healthyConfigs = allConfigs.filter(c => c.errorCount < 10);
    const overallHealth = healthyConfigs.length > 0 ? 'healthy' : 'degraded';

    return {
      status: overallHealth,
      timestamp: new Date().toISOString(),
      totalConfigs: stats.totalConfigs,
      healthyConfigs: healthyConfigs.length,
      currentConfig: stats.currentConfig,
      pendingRequests: stats.pendingRequests,
      stats: allConfigs,
    };
  }

  resetStats() {
    this.configs.forEach(config => {
      config.requestCount = 0;
      config.errorCount = 0;
      config.lastError = null;
      config.lastErrorTime = null;
    });
    console.log(`[CloudflareAI] ${CLI_SYMBOLS.progress} Stats reset`);
  }

  getConfigInfo() {
    return {
      timestamp: new Date().toISOString(),
      configCount: this.configs.length,
      configs: this.configs.map((config, idx) => ({
        index: config.index,
        model: config.model,
        hasAccountId: !!config.accountId,
        hasToken: !!config.apiToken,
        tokenLength: config.apiToken?.length || 0,
        requestCount: config.requestCount,
        errorCount: config.errorCount,
      })),
      warnings: this._generateWarnings(),
    };
  }

  _generateWarnings() {
    const warnings = [];

    if (this.configs.length === 0) {
      warnings.push({
        severity: 'critical',
        message: 'No Cloudflare configurations found',
        action: 'Set CLOUDFLARE_ACCOUNT_ID_1 and CLOUDFLARE_API_TOKEN_1 in .env',
      });
    }

    if (this.configs.length === 1) {
      warnings.push({
        severity: 'warning',
        message: 'Only 1 Cloudflare config available',
        action: 'Add CLOUDFLARE_ACCOUNT_ID_2 and CLOUDFLARE_API_TOKEN_2 to prevent rate limit errors',
      });
    }

    const highErrorConfigs = this.configs.filter(c => c.errorCount > 5);
    if (highErrorConfigs.length > 0) {
      warnings.push({
        severity: 'warning',
        message: `${highErrorConfigs.length} config(s) have high error count`,
        configs: highErrorConfigs.map(c => ({ index: c.index, errorCount: c.errorCount })),
        action: 'Check token validity and network connectivity',
      });
    }

    return warnings;
  }
}

module.exports = new CloudflareAiService();
