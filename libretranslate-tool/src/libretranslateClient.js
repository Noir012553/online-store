const http = require('node:http');
const https = require('node:https');

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

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
        reject(new Error(`LibreTranslate returned invalid JSON (HTTP ${response.statusCode})`));
        return;
      }

      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(data);
        return;
      }

      const error = new Error(data.error || `LibreTranslate request failed (HTTP ${response.statusCode})`);
      error.statusCode = response.statusCode;
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
  } = {}) {
    this.url = `${baseUrl.replace(/\/$/, '')}/translate`;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;
    this.apiKey = apiKey;
  }

  async translate(text, source, target) {
    if (typeof text !== 'string' || text.trim() === '' || source === target) return text;

    const body = { q: text, source, target, format: 'text' };
    if (this.apiKey) body.api_key = this.apiKey;

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await requestJson(this.url, body, this.timeoutMs);
        if (typeof response.translatedText !== 'string') {
          throw new Error('LibreTranslate response is missing translatedText');
        }
        return response.translatedText;
      } catch (error) {
        const retryable = error.statusCode === undefined || RETRYABLE_STATUSES.has(error.statusCode);
        if (attempt >= this.retries || !retryable) throw error;
        await sleep(this.retryDelayMs * (2 ** attempt));
      }
    }
  }
}

module.exports = { LibreTranslateClient, requestJson };
