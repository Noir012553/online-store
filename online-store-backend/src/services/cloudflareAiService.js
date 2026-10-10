const axios = require('axios');
const crypto = require('crypto');
const { isSupportedLanguage, getActiveLangCodes, getLanguageByCode } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { isNoInputTranslationResponse } = require('../utils/translationResponseGuard');

const LOCALIZATION_SYSTEM_PROMPT = `You are a translator for e-commerce products.

KEY RULES:
1. Preserve every technical specification, number, unit, SKU, and model identifier exactly as written; do not normalize, correct, infer, or replace them
2. Do not add technical details, features, or product claims that are absent from the source
3. Do NOT translate HTML tags, only text content
4. Keep brand names unchanged
5. Return ONLY translated text, NO explanations
6. Preserve formatting and line breaks
7. Do NOT leave Vietnamese words or sentences in the translation, except brand names, model names, and technical identifiers
8. The source text may be a single word or proper noun; never claim that the input text is missing

IMPORTANT:
- Chính hãng → Official/Genuine
- Stock numbers, CPU/RAM/storage specs → Keep unchanged
- Professional, formal tone for products`;

const stripTranslationPrefix = (text) => text
  .replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '')
  .trim();
const RATE_LIMIT_STATUS_CODES = new Set([420, 429]);
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);
const parseNonNegativeInteger = (name, fallback = 0) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};
const parsePositiveInteger = (name, fallback) => {
  const value = parseNonNegativeInteger(name, fallback);
  if (value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};
const getRetryAfterMs = (headers) => {
  const retryAfter = headers?.get?.('retry-after')
    ?? headers?.['retry-after']
    ?? headers?.['Retry-After'];
  if (retryAfter === undefined || retryAfter === null || retryAfter === '') return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now());
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

const getProviderResponseMetadata = (response) => {
  const result = response.data?.result;
  return {
    status: response.status,
    statusText: response.statusText,
    data: {
      success: response.data?.success,
      ...(typeof response.data?.message === 'string' ? { message: response.data.message } : {}),
      ...(Array.isArray(response.data?.errors) ? { errors: response.data.errors } : {}),
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
      responseType: typeof result?.response,
    },
  };
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
    this.lastConfigIndex = null;
    this.rateLimitCooldownMs = parsePositiveInteger('CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS', 30000);
    this.maxRateLimitCooldownMs = parsePositiveInteger('CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS', 900000);
    this.maxParallelRequestsPerConfig = parsePositiveInteger('CLOUDFLARE_MAX_PARALLEL_PER_KEY', 1);
    this.configAvailabilityWaiters = [];
    this.maxRequestsPerSecond = parsePositiveInteger('CLOUDFLARE_MAX_REQUESTS_PER_SEC', 5);
    const configuredConcurrency = parsePositiveInteger('CLOUDFLARE_MAX_PARALLEL_REQUESTS', 1);
    this.queue = new SimpleQueue(Math.min(configuredConcurrency, this.configs.length || 1));
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
          coolingDown: c.coolingDown,
          cooldownUntil: c.cooldownUntil,
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
          cooldownUntil: 0,
          rateLimitCount: 0,
          runningRequests: 0,
          halfOpenProbeInFlight: false,
          circuitGeneration: 0,
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
        cooldownUntil: 0,
        rateLimitCount: 0,
        runningRequests: 0,
        halfOpenProbeInFlight: false,
        circuitGeneration: 0,
      });
    }

    return configs;
  }

  selectConfig(excludedIndexes = new Set()) {
    const now = Date.now();
    for (let offset = 0; offset < this.configs.length; offset += 1) {
      const index = (this.configIndex + offset) % this.configs.length;
      const config = this.configs[index];
      if (
        excludedIndexes.has(config.index)
        || (config.cooldownUntil || 0) > now
        || (config.runningRequests || 0) >= this.maxParallelRequestsPerConfig
        || (config.cooldownUntil > 0 && config.halfOpenProbeInFlight)
      ) continue;
      this.configIndex = (index + 1) % this.configs.length;
      this.lastConfigIndex = config.index;
      const halfOpenProbe = config.cooldownUntil > 0;
      config.runningRequests = (config.runningRequests || 0) + 1;
      if (halfOpenProbe) config.halfOpenProbeInFlight = true;
      return { config, halfOpenProbe, generation: config.circuitGeneration || 0 };
    }
    return null;
  }

  async acquireConfig(excludedIndexes) {
    while (true) {
      const lease = this.selectConfig(excludedIndexes);
      if (lease) return lease;
      const now = Date.now();
      const untriedConfigs = this.configs.filter((entry) => (
        !excludedIndexes.has(entry.index) && (entry.cooldownUntil || 0) <= now
      ));
      if (untriedConfigs.length === 0) return null;
      await new Promise((resolve) => this.configAvailabilityWaiters.push(resolve));
    }
  }

  releaseConfig(config, halfOpenProbe = false) {
    config.runningRequests = Math.max(0, config.runningRequests - 1);
    if (halfOpenProbe) config.halfOpenProbeInFlight = false;
    this.configAvailabilityWaiters.splice(0).forEach((resolve) => resolve());
  }

  getRateLimitCooldown(config, error) {
    const retryAfterMs = getRetryAfterMs(error.response?.headers);
    if (retryAfterMs !== null) return retryAfterMs;
    const cooldown = this.rateLimitCooldownMs * (2 ** Math.max(0, (config.rateLimitCount || 1) - 1));
    const jitter = Math.random() * cooldown * 0.1;
    return Math.min(cooldown + jitter, this.maxRateLimitCooldownMs);
  }

  validate() {
    if (this.configs.length === 0) {
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

  getIdempotencyKey(text, targetLang) {
    return crypto.createHash('md5').update(`${text}:${targetLang}`).digest('hex');
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

  async translate(text, sourceLang, targetLang, signal = null, retries = 3, baseDelay = 2000) {
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
    const idempotencyKey = this.getIdempotencyKey(text, targetLang);

    if (this.pendingRequests.has(idempotencyKey)) {
      return this.pendingRequests.get(idempotencyKey);
    }

    const promise = this.queue.add(async () => {
      return this._doTranslate(text, sourceLang, targetLang, signal, retries, baseDelay, new Set(), true);
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
    useExplicitOutputPrompt = false,
  ) {
    // Validate required parameters
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }
    if (!targetLang) {
      throw new Error('Target language (targetLang) is required');
    }
    let config;
    let halfOpenProbe = false;
    let configGeneration = 0;
    try {
      this.validate();

      if (!isSupportedLanguage(targetLang)) {
        const supportedLangs = getActiveLangCodes().join(', ');
        throw new Error(`Unsupported target language: ${targetLang}. Supported languages: ${supportedLangs}`);
      }

      if (sourceLang === targetLang) {
        return text;
      }

      const lease = await this.acquireConfig(attemptedConfigIndexes);
      config = lease?.config;
      halfOpenProbe = lease?.halfOpenProbe || false;
      configGeneration = lease?.generation || 0;
      if (!config) {
        const nextCooldownAt = Math.min(...this.configs
          .filter((entry) => (entry.cooldownUntil || 0) > Date.now())
          .map((entry) => entry.cooldownUntil));
        const error = new Error('All Cloudflare configurations are cooling down');
        error.response = { status: 429, headers: {} };
        error.retryAfterMs = Number.isFinite(nextCooldownAt) ? Math.max(0, nextCooldownAt - Date.now()) : this.rateLimitCooldownMs;
        error.cloudflarePoolExhausted = true;

        throw error;
      }

      await this.throttle();
      if (enforceBudget) this.reserveUsage(text.length);

      const startTime = Date.now();
      const sourceLanguage = getLanguageByCode(sourceLang)?.name || sourceLang;
      const targetLanguage = getLanguageByCode(targetLang)?.name || targetLang;
      const userPrompt = useExplicitOutputPrompt
        ? `Translate the source text below from ${sourceLanguage} to ${targetLanguage}. It may be very short, a single word, or a technical value. Always return a non-empty translation; if it should remain unchanged, copy it exactly. Return only the translated text.\n\n${text}`
        : `Translate this text from ${sourceLanguage} to ${targetLanguage}. Return only the translation.\n\n${text}`;
      const response = await axios.post(
        config.baseUrl,
        {
          messages: [
            {
              role: 'system',
              content: LOCALIZATION_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          max_tokens: getMaxOutputTokens(),
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
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

      const result = response.data.result || {};
      const finishReason = String(result.finish_reason || result.finishReason || '').toLowerCase();
      if (['length', 'max_tokens', 'max_output_tokens', 'token_limit'].includes(finishReason)) {
        throw Object.assign(new Error('Cloudflare translation reached the output token limit'), {
          code: 'TRANSLATION_OUTPUT_INCOMPLETE',
        });
      }
      if (typeof result.response !== 'string') {
        throw Object.assign(new Error('Cloudflare AI response is missing result.response text'), {
          code: 'CLOUDFLARE_RESPONSE_INVALID',
          response: getProviderResponseMetadata(response),
        });
      }

      const normalizedTranslation = stripTranslationPrefix(result.response);

      if (!normalizedTranslation) {
        throw Object.assign(new Error('Cloudflare AI response contains no translation text'), {
          code: 'CLOUDFLARE_RESPONSE_INVALID',
          response: getProviderResponseMetadata(response),
        });
      }
      if (isNoInputTranslationResponse(normalizedTranslation)) {
        throw Object.assign(new Error('No usable translation returned from Cloudflare API'), {
          code: 'TRANSLATION_OUTPUT_INCOMPLETE',
        });
      }

      config.requestCount++;
      if (configGeneration === (config.circuitGeneration || 0)) {
        config.rateLimitCount = 0;
        config.cooldownUntil = 0;
        config.halfOpenProbeInFlight = false;
      }
      console.log(`[CloudflareAI] ${CLI_SYMBOLS.success} Translation success: { textLength: ${text.length}, sourceLang: '${sourceLang}', targetLang: '${targetLang}', duration: '${duration}ms', config: '#${config.index}/${this.configs.length}', totalRequests: ${config.requestCount} }`);

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

      if (isRateLimited && config) {
        config.errorCount++;
        config.rateLimitCount = (config.rateLimitCount || 0) + 1;
        config.circuitGeneration = (config.circuitGeneration || 0) + 1;
        config.halfOpenProbeInFlight = false;
        config.lastError = `Rate limited or quota exhausted (${error.response?.status || 'provider message'})`;
        config.lastErrorTime = new Date();
        const cooldownMs = this.getRateLimitCooldown(config, error);
        config.cooldownUntil = Date.now() + cooldownMs;

        const failedConfigIndex = config.index;
        const attemptedConfigs = new Set(attemptedConfigIndexes);
        attemptedConfigs.add(failedConfigIndex);
        this.releaseConfig(config, halfOpenProbe);
        config = null;
        halfOpenProbe = false;
        const hasUntriedConfig = this.configs.some((entry) => (
          !attemptedConfigs.has(entry.index) && (entry.cooldownUntil || 0) <= Date.now()
        ));
        if (hasUntriedConfig) {
          console.warn(`[CloudflareAI] ${CLI_SYMBOLS.progress} Config #${failedConfigIndex} rate limited; cooling down for ${cooldownMs}ms and trying another config`);
          return this._doTranslate(
            text,
            sourceLang,
            targetLang,
            signal,
            retries,
            baseDelay,
            attemptedConfigs,
            enforceBudget,
            useExplicitOutputPrompt,
          );
        }

        const nextCooldown = Math.min(...this.configs
          .filter((entry) => (entry.cooldownUntil || 0) > Date.now())
          .map((entry) => entry.cooldownUntil - Date.now()));
        if (Number.isFinite(nextCooldown)) error.retryAfterMs = nextCooldown;
        error.cloudflarePoolExhausted = true;
        console.error(`[CloudflareAI] ${CLI_SYMBOLS.error} Config #${failedConfigIndex} rate limited; no untried key is currently available`);
      }

      if (halfOpenProbe && config) {
        const cooldownMs = this.rateLimitCooldownMs;
        config.cooldownUntil = Date.now() + cooldownMs;
        config.lastError = error.message;
        config.lastErrorTime = new Date();
        this.releaseConfig(config, true);
        config = null;
        halfOpenProbe = false;
        error.retryAfterMs = cooldownMs;
        throw error;
      }

      // Retry transient network, timeout, and server errors
      const statusCode = error.response?.status;
      const isServerError = statusCode >= 500 && statusCode < 600;
      const isRetryable = (
        error.code === 'CLOUDFLARE_RESPONSE_INVALID' ||
        isDnsError ||
        isNetworkUnreachable ||
        (isRateLimited && !config && error.retryAfterMs !== undefined && !error.cloudflarePoolExhausted) ||
        RETRYABLE_STATUS_CODES.has(statusCode) ||
        isServerError ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('timeout') ||
        error.message?.includes('canceled')
      );

      if (retries > 0 && isRetryable) {
        if (config) {
          this.releaseConfig(config, halfOpenProbe);
          config = null;
          halfOpenProbe = false;
        }
        const retriesUsed = 3 - retries;
        // For server errors (5xx), use longer exponential backoff
        const serverErrorMultiplier = isServerError ? 2 : 1;
        const exponentialDelay = error.retryAfterMs
          ?? baseDelay * Math.pow(2, retriesUsed) * serverErrorMultiplier;

        console.warn(`[CloudflareAI] ${CLI_SYMBOLS.warning} Retry (${retries} left) - waiting ${exponentialDelay}ms`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          retryCount: retriesUsed,
          nextDelay: `${exponentialDelay}ms`,
        });
        await new Promise(resolve => setTimeout(resolve, exponentialDelay));
        const retryAttemptedConfigs = isRateLimited && !config
          ? new Set()
          : attemptedConfigIndexes;
        return this._doTranslate(
          text,
          sourceLang,
          targetLang,
          signal,
          retries - 1,
          baseDelay,
          retryAttemptedConfigs,
          enforceBudget,
          useExplicitOutputPrompt || error.code === 'CLOUDFLARE_RESPONSE_INVALID',
        );
      }

      console.error(`[CloudflareAI] ${CLI_SYMBOLS.error} Translation failed (exhausted retries):`, {
        textLength: text.length,
        targetLang,
        error: error.message,
        code: error.code,
        status: error.response?.status,
        retryAfterMs: error.retryAfterMs,
      });

      throw error;
    } finally {
      if (config) this.releaseConfig(config, halfOpenProbe);
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
      currentConfig: this.lastConfigIndex,
      totalConfigs: this.configs.length,
      configs: this.configs.map(c => ({
        index: c.index,
        requestCount: c.requestCount,
        errorCount: c.errorCount,
        runningRequests: c.runningRequests || 0,
        lastError: c.lastError,
        lastErrorTime: c.lastErrorTime,
        cooldownUntil: c.cooldownUntil ? new Date(c.cooldownUntil).toISOString() : null,
        coolingDown: (c.cooldownUntil || 0) > Date.now(),
      })),
    };
  }

  getHealth() {
    const stats = this.getStats();
    const allConfigs = stats.configs;
    const healthyConfigs = allConfigs.filter(c => !c.coolingDown);
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
      configs: this.configs.map((config) => ({
        index: config.index,
        model: config.model,
        hasAccountId: !!config.accountId,
        hasToken: !!config.apiToken,
        requestCount: config.requestCount,
        errorCount: config.errorCount,
        runningRequests: config.runningRequests || 0,
        coolingDown: (config.cooldownUntil || 0) > Date.now(),
        cooldownUntil: config.cooldownUntil ? new Date(config.cooldownUntil).toISOString() : null,
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
