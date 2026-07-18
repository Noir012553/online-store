const axios = require('axios');
const crypto = require('crypto');
const { isSupportedLanguage, getActiveLangCodes } = require('../config/languageInventory');

const LOCALIZATION_SYSTEM_PROMPT = `You are a translator for e-commerce products.

KEY RULES:
1. Preserve technical specs and numbers exactly (e.g., "16GB", "1TB", "i7")
2. Do NOT translate HTML tags, only text content
3. Keep brand names unchanged
4. Return ONLY translated text, NO explanations
5. Preserve formatting and line breaks

IMPORTANT:
- Chính hãng → Official/Genuine
- Stock numbers, CPU/RAM/storage specs → Keep unchanged
- Professional, formal tone for products`;

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

    // Idempotency cache (in-memory, prevents duplicate requests)
    this.pendingRequests = new Map();

    // Periodic health check logging (every 30 minutes)
    this.setupPeriodicLogging();
  }

  setupPeriodicLogging() {
    setInterval(() => {
      const stats = this.getStats();
      const health = this.getHealth();
      console.log('[CloudflareAI] 📊 Periodic Health Check:', {
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
  }

  _loadConfigs() {
    const configs = [];
    const envKeys = Object.keys(process.env);
    const accountIdKeys = envKeys.filter(key => /^CLOUDFLARE_ACCOUNT_ID_\d+$/.test(key));

    if (accountIdKeys.length === 0) {
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

    const maxIndex = Math.max(...accountIdKeys.map(key => parseInt(key.match(/\d+$/)[0])));

    for (let i = 1; i <= maxIndex; i++) {
      const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID_${i}`];
      const apiToken = process.env[`CLOUDFLARE_API_TOKEN_${i}`];
      const model = process.env[`CLOUDFLARE_AI_MODEL_${i}`] || '@cf/meta/llama-3-8b-instruct';

      if (accountId && apiToken) {
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
    }

    return configs;
  }

  updateCurrentConfig() {
    if (this.configs.length === 0) {
      throw new Error('No Cloudflare configurations found. Set CLOUDFLARE_ACCOUNT_ID_1/2/... in .env');
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
    console.log(`[CloudflareAI] 🔄 Rotated to config #${this.currentConfig.index}`);
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

  getIdempotencyKey(text, targetLang) {
    return crypto.createHash('md5').update(`${text}:${targetLang}`).digest('hex');
  }

  async translate(text, sourceLang, targetLang, signal = null, retries = 3, baseDelay = 2000) {
    // Validate required parameters
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }
    if (!targetLang) {
      throw new Error('Target language (targetLang) is required');
    }
    const idempotencyKey = this.getIdempotencyKey(text, targetLang);

    if (this.pendingRequests.has(idempotencyKey)) {
      return this.pendingRequests.get(idempotencyKey);
    }

    const promise = this.queue.add(async () => {
      return this._doTranslate(text, sourceLang, targetLang, signal, retries, baseDelay);
    });

    this.pendingRequests.set(idempotencyKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(idempotencyKey);
    }
  }

  async _doTranslate(text, sourceLang, targetLang, signal = null, retries = 3, baseDelay = 2000) {
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
              content: `Translate this text to ${targetLang}:\n\n${text}`,
            },
          ],
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

      if (!translatedText.trim()) {
        throw new Error('No translation returned from Cloudflare API');
      }

      this.currentConfig.requestCount++;
      console.log(`[CloudflareAI] ✅ Translation success: { textLength: ${text.length}, sourceLang: '${sourceLang}', targetLang: '${targetLang}', duration: '${duration}ms', config: '#${this.currentConfig.index}/${this.configs.length}', totalRequests: ${this.currentConfig.requestCount} }`);

      return translatedText.trim();
    } catch (error) {
      // Detect permanent/non-retryable errors (API is down)
      const isDnsError =
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN' ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('getaddrinfo');

      const isNetworkUnreachable =
        error.code === 'ENETUNREACH' ||
        error.message?.includes('ENETUNREACH');

      if (isDnsError || isNetworkUnreachable) {
        console.error('[CloudflareAI] Network error - API unavailable:', {
          error: error.message,
          code: error.code,
        });
        throw error;
      }

      const isRateLimited =
        error.response?.status === 429 ||
        error.message?.includes('429');

      // If rate limited and multiple configs, try next config
      if (isRateLimited && this.configs.length > 1) {
        this.currentConfig.errorCount++;
        this.currentConfig.lastError = 'Rate limited (429)';
        this.currentConfig.lastErrorTime = new Date();
        this.rotateConfig();
        console.warn(`[CloudflareAI] 🔄 Rate limit hit - switched to config #${this.currentConfig.index}`);
        // Retry with new config immediately
        return this._doTranslate(text, sourceLang, targetLang, signal, retries, baseDelay);
      }

      // Only retry transient errors (rate limit, timeout, connection reset, server errors)
      const isServerError = error.response?.status >= 500 && error.response?.status < 600;
      const isRetryable = (
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
        const isServerError = error.response?.status >= 500 && error.response?.status < 600;
        const serverErrorMultiplier = isServerError ? 2 : 1;
        const exponentialDelay = baseDelay * Math.pow(2, retriesUsed) * serverErrorMultiplier;

        console.warn(`[CloudflareAI] ⚠️ Retry (${retries} left) - waiting ${exponentialDelay}ms`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          retryCount: retriesUsed,
          nextDelay: `${exponentialDelay}ms`,
        });
        await new Promise(resolve => setTimeout(resolve, exponentialDelay));
        return this._doTranslate(text, sourceLang, targetLang, signal, retries - 1, baseDelay);
      }

      console.error('[CloudflareAI] ❌ Translation failed (exhausted retries):', {
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
    console.log('[CloudflareAI] 🔄 Stats reset');
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
