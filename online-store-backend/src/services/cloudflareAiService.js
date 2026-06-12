const axios = require('axios');

const SUPPORTED_LANGUAGES = {
  vi: 'Vietnamese',
  en: 'English',
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

class CloudflareAiService {
  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3-8b-instruct';
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
  }

  validate() {
    if (!this.accountId || !this.apiToken) {
      throw new Error(
        'Cloudflare credentials not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env'
      );
    }
  }

  async translate(text, sourceLang = 'vi', targetLang = 'en', signal = null, retries = 3, baseDelay = 2000) {
    try {
      this.validate();

      if (!SUPPORTED_LANGUAGES[targetLang]) {
        throw new Error(`Unsupported target language: ${targetLang}. Only English (en) is supported.`);
      }

      if (sourceLang === targetLang) {
        return text;
      }

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

      if (response.data.success === false) {
        throw new Error(`Cloudflare AI error: ${response.data.errors?.[0]?.message || 'Unknown error'}`);
      }

      const translatedText = response.data.result?.response || '';
      if (!translatedText) {
        throw new Error('No translation returned from Cloudflare API');
      }

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
        console.warn(`[CloudflareAI] Retry (${retries} left) - waiting ${exponentialDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, exponentialDelay));
        return this.translate(text, sourceLang, targetLang, signal, retries - 1, baseDelay);
      }

      console.error('[CloudflareAI] Translation error:', {
        text: text.substring(0, 50),
        targetLang,
        error: error.message,
        code: error.code,
      });

      throw error;
    }
  }
}

module.exports = new CloudflareAiService();
