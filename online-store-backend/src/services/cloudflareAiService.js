const axios = require('axios');
const crypto = require('crypto');

const SUPPORTED_LANGUAGES = {
  vi: 'Vietnamese',
  en: 'English',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  nl: 'Nederlands',
  sv: 'Svenska',
};

const LOCALIZATION_SYSTEM_PROMPT = `You are an expert software localization specialist with deep knowledge of e-commerce platforms and laptop industry terminology.

Your responsibilities:
1. Translate text accurately while preserving technical specifications and numbers
2. Maintain HTML structure and tags - never translate HTML markup, only the text content inside tags
3. For technical specs (e.g., "16GB DDR5", "1TB NVMe"), preserve the technical values but translate attribute names
4. Adapt cultural context appropriately for each language (e.g., currency references, date formats)
5. Maintain consistency with common e-commerce terminology in the target language
6. Preserve tone and style - if source is professional, keep it professional; if casual, keep it casual
7. For product names with brand modifiers (e.g., "Chính hãng", "Likenew"), provide appropriate localization

Output format:
- Return ONLY the translated text, no explanations or metadata
- Preserve original formatting and line breaks
- If translating HTML content, maintain all tags and structure`;

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
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3-8b-instruct';
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;

    // Rate limiting config
    this.maxRequestsPerSecond = parseInt(process.env.CLOUDFLARE_MAX_REQUESTS_PER_SEC || '5');
    this.queue = new SimpleQueue(3);
    this.lastRequestTime = 0;
    this.requestTimestamps = [];

    // Idempotency cache (in-memory, prevents duplicate requests)
    this.pendingRequests = new Map();
  }

  validate() {
    if (!this.accountId || !this.apiToken) {
      throw new Error(
        'Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env'
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

  async translate(text, sourceLang = 'vi', targetLang = 'en', signal = null, retries = 3, baseDelay = 2000) {
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

  async _doTranslate(text, sourceLang = 'vi', targetLang = 'en', signal = null, retries = 3, baseDelay = 2000) {
    try {
      this.validate();

      if (!SUPPORTED_LANGUAGES[targetLang]) {
        throw new Error(`Unsupported target language: ${targetLang}. Only English (en) is supported.`);
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
              content: `Translate this text to ${SUPPORTED_LANGUAGES[targetLang]}:\n\n${text}`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
          signal,
        }
      );

      const duration = Date.now() - startTime;

      if (response.data.success === false) {
        throw new Error(`Cloudflare AI error: ${response.data.errors?.[0]?.message || 'Unknown error'}`);
      }

      const translatedText = response.data.result?.response || '';
      if (!translatedText) {
        throw new Error('No translation returned from Cloudflare API');
      }

      console.log('[CloudflareAI] ✅ Translation success:', {
        textLength: text.length,
        sourceLang,
        targetLang,
        duration: `${duration}ms`,
      });

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

      // Only retry transient errors (rate limit, timeout, connection reset)
      const isRetryable = (
        isRateLimited ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('timeout') ||
        error.message?.includes('canceled')
      );

      if (retries > 0 && isRetryable) {
        const retriesUsed = 3 - retries;
        const exponentialDelay = baseDelay * Math.pow(2, retriesUsed);
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
    };
  }
}

module.exports = new CloudflareAiService();
