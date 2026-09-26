const http = require('node:http');
const https = require('node:https');

const RETRYABLE_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));
const getRetryAfterMs = (headers) => {
  const retryAfter = headers?.['retry-after'];
  if (retryAfter === undefined) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now());
};
const createCircuitOpenError = (retryAfterMs) => {
  const error = new Error('LibreTranslate circuit is open');
  error.code = 'LIBRETRANSLATE_CIRCUIT_OPEN';
  error.statusCode = 429;
  error.retryAfterMs = retryAfterMs;
  return error;
};
const getPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const requestJson = (url, body, timeoutMs) => new Promise((resolve, reject) => {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;
  const payload = JSON.stringify(body);
  const request = transport.request({
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    },
  }, (response) => {
    let responseBody = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      responseBody += chunk;
    });
    response.on('end', () => {
      let data;
      try {
        data = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        const error = new Error(`LibreTranslate returned invalid JSON (HTTP ${response.statusCode})`);
        error.statusCode = response.statusCode;
        error.retryAfterMs = getRetryAfterMs(response.headers);
        reject(error);
        return;
      }

      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(data);
        return;
      }

      const error = new Error(data.error || `LibreTranslate request failed (HTTP ${response.statusCode})`);
      error.statusCode = response.statusCode;
      error.retryAfterMs = getRetryAfterMs(response.headers);
      reject(error);
    });
  });

  request.setTimeout(timeoutMs, () => {
    request.destroy(new Error(`LibreTranslate request timed out after ${timeoutMs}ms`));
  });
  request.on('error', reject);
  request.write(payload);
  request.end();
});

class LibreTranslateClient {
  constructor({
    baseUrl = process.env.LIBRETRANSLATE_URL || 'http://127.0.0.1:5001',
    timeoutMs = Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || 30000),
    retries = Number(process.env.LIBRETRANSLATE_RETRIES || 2),
    retryDelayMs = Number(process.env.LIBRETRANSLATE_RETRY_DELAY_MS || 1000),
    apiKey = process.env.LIBRETRANSLATE_API_KEY || '',
    maxParallelRequests = getPositiveInteger(process.env.LIBRETRANSLATE_MAX_PARALLEL_REQUESTS, 1),
    rateLimitCooldownMs = getPositiveInteger(process.env.LIBRETRANSLATE_RATE_LIMIT_COOLDOWN_MS, 30000),
    maxRateLimitCooldownMs = getPositiveInteger(process.env.LIBRETRANSLATE_MAX_RATE_LIMIT_COOLDOWN_MS, 900000),
  } = {}) {
    this.url = `${baseUrl.replace(/\/$/, '')}/translate`;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;
    this.apiKey = apiKey;
    this.maxParallelRequests = maxParallelRequests;
    this.currentParallelRequests = maxParallelRequests;
    this.rateLimitCooldownMs = rateLimitCooldownMs;
    this.maxRateLimitCooldownMs = maxRateLimitCooldownMs;
    this.rateLimitCount = 0;
    this.cooldownUntil = 0;
    this.halfOpenProbeInFlight = false;
    this.circuitGeneration = 0;
    this.successesSinceIncrease = 0;
    this.runningRequests = 0;
    this.waitingRequests = [];
  }

  async acquireSlot() {
    if (this.runningRequests < this.currentParallelRequests) {
      this.runningRequests++;
      return;
    }

    await new Promise((resolve) => this.waitingRequests.push(resolve));
    this.runningRequests++;
  }

  releaseSlot() {
    this.runningRequests--;
    if (this.runningRequests < this.currentParallelRequests) {
      const next = this.waitingRequests.shift();
      if (next) next();
    }
  }

  acquireCircuitPermit() {
    const now = Date.now();
    if (this.cooldownUntil > now) {
      throw createCircuitOpenError(this.cooldownUntil - now);
    }
    if (this.cooldownUntil && this.halfOpenProbeInFlight) {
      throw createCircuitOpenError(0);
    }
    if (this.cooldownUntil > 0) this.halfOpenProbeInFlight = true;
    return { generation: this.circuitGeneration };
  }

  openCircuit(error) {
    this.rateLimitCount += 1;
    this.circuitGeneration += 1;
    this.halfOpenProbeInFlight = false;
    this.successesSinceIncrease = 0;
    this.currentParallelRequests = Math.max(1, Math.floor(this.currentParallelRequests / 2));
    const cooldownMs = error.retryAfterMs
      ?? Math.min(this.rateLimitCooldownMs * (2 ** (this.rateLimitCount - 1)), this.maxRateLimitCooldownMs);
    this.cooldownUntil = Date.now() + cooldownMs;
    error.retryAfterMs = cooldownMs;
  }

  closeCircuit(generation) {
    if (generation !== this.circuitGeneration) return;
    this.rateLimitCount = 0;
    this.cooldownUntil = 0;
    this.halfOpenProbeInFlight = false;
    this.successesSinceIncrease += 1;
    if (this.successesSinceIncrease >= 20 && this.currentParallelRequests < this.maxParallelRequests) {
      this.currentParallelRequests += 1;
      this.successesSinceIncrease = 0;
    }
  }

  async translate(text, source, target) {
    if (typeof text !== 'string' || text.trim() === '' || source === target) return text;

    const body = { q: text, source, target, format: 'text' };
    if (this.apiKey) body.api_key = this.apiKey;

    await this.acquireSlot();
    try {
      const { generation } = this.acquireCircuitPermit();
      for (let attempt = 0; ; attempt += 1) {
        try {
          const response = await requestJson(this.url, body, this.timeoutMs);
          if (typeof response.translatedText !== 'string') {
            throw new Error('LibreTranslate response is missing translatedText');
          }
          this.closeCircuit(generation);
          return response.translatedText;
        } catch (error) {
          if (error.statusCode === 429 || error.statusCode === 420) {
            this.openCircuit(error);
            throw error;
          }
          if (error.code === 'ETIMEDOUT' || /timed out/i.test(error.message || '')) {
            this.currentParallelRequests = Math.max(1, Math.floor(this.currentParallelRequests / 2));
            this.successesSinceIncrease = 0;
          }
          const retryable = error.statusCode === undefined || RETRYABLE_STATUSES.has(error.statusCode);
          if (attempt >= this.retries || !retryable) {
            if (generation === this.circuitGeneration) this.halfOpenProbeInFlight = false;
            throw error;
          }
          const exponentialDelay = this.retryDelayMs * (2 ** attempt);
          const jitter = Math.random() * exponentialDelay * 0.1;
          await sleep(error.retryAfterMs ?? exponentialDelay + jitter);
        }
      }
    } finally {
      this.releaseSlot();
    }
  }
}

module.exports = { LibreTranslateClient, requestJson };
