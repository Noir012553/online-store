const {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  splitText,
  joinTranslatedChunks,
} = require('../../../libretranslate-tool/src/productTranslator');
const { LibreTranslateClient } = require('../../../libretranslate-tool/src/libretranslateClient');
const cloudflareAiService = require('./cloudflareAiService');

let client;
let activeRequests = 0;
const queuedRequests = [];
const translationMemoryCache = new Map();
const MEMORY_CACHE_TTL_MS = 60 * 60 * 1000;

const getMemoryCacheKey = (text, sourceLang, targetLang) => `${sourceLang}:${targetLang}:${text}`;

const getCachedTranslation = (key) => {
  const cached = translationMemoryCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    translationMemoryCache.delete(key);
    return null;
  }
  translationMemoryCache.delete(key);
  translationMemoryCache.set(key, cached);
  return cached.value;
};

const setCachedTranslation = (key, value) => {
  translationMemoryCache.delete(key);
  translationMemoryCache.set(key, { value, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
  while (translationMemoryCache.size > 500) {
    translationMemoryCache.delete(translationMemoryCache.keys().next().value);
  }
};

const isEnabled = () => process.env.LIBRETRANSLATE_ENABLED === 'true';
const isFallbackEnabled = () => process.env.LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT === 'true';

const getMaxParallelRequests = () => {
  const configured = Number(process.env.LIBRETRANSLATE_MAX_PARALLEL_REQUESTS || process.env.LIBRETRANSLATE_CONCURRENCY || 1);
  return Number.isInteger(configured) && configured > 0 ? configured : 1;
};

const drainQueue = () => {
  while (activeRequests < getMaxParallelRequests() && queuedRequests.length > 0) {
    const { task, resolve, reject } = queuedRequests.shift();
    activeRequests++;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeRequests--;
        drainQueue();
      });
  }
};

const runWithLimit = (task) => new Promise((resolve, reject) => {
  queuedRequests.push({ task, resolve, reject });
  drainQueue();
});

const translateChunks = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getChunkSize());
  const translatedChunks = [];
  for (const chunk of chunks) {
    const cacheKey = getMemoryCacheKey(chunk, sourceLang, targetLang);
    const cached = getCachedTranslation(cacheKey);
    if (cached) {
      translatedChunks.push(cached);
      continue;
    }
    const translated = await runWithLimit(() => getClient().translate(chunk, sourceLang, targetLang));
    setCachedTranslation(cacheKey, translated);
    translatedChunks.push(translated);
  }
  return joinTranslatedChunks(chunks, translatedChunks);
};

const getClient = () => {
  if (!client) client = new LibreTranslateClient();
  return client;
};

const getChunkSize = () => {
  const configured = Number(process.env.LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_DESCRIPTION_CHUNK_SIZE;
};

const translateDraft = async (text, sourceLang, targetLang) => {
  if (!isEnabled() || typeof text !== 'string' || text.trim() === '' || sourceLang === targetLang) {
    return '';
  }

  try {
    return await translateChunks(text, sourceLang, targetLang);
  } catch (error) {
    console.warn('[LibreTranslate] Product draft unavailable; continuing with Cloudflare AI:', error.message);
    return '';
  }
};

const stripTranslationPrefix = (text) => (
  text.replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '').trim()
);

const translateFallback = async (text, sourceLang, targetLang) => {
  if (!isEnabled() || !isFallbackEnabled() || typeof text !== 'string' || text.trim() === '' || sourceLang === targetLang) {
    return '';
  }

  return translateChunks(text, sourceLang, targetLang);
};

const translateWithCloudflare = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getChunkSize());
  const translatedChunks = [];

  for (const chunk of chunks) {
    const draftText = await translateDraft(chunk, sourceLang, targetLang);
    const translatedChunk = await cloudflareAiService.translate(
      chunk,
      sourceLang,
      targetLang,
      null,
      3,
      2000,
      { draftText },
    );
    translatedChunks.push(stripTranslationPrefix(translatedChunk));
  }

  return joinTranslatedChunks(chunks, translatedChunks);
};

module.exports = {
  isEnabled,
  isFallbackEnabled,
  translateDraft,
  translateFallback,
  translateWithCloudflare,
};
