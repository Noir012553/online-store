const {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  splitText,
  joinTranslatedChunks,
} = require('../../../libretranslate-tool/src/productTranslator');
const { LibreTranslateClient } = require('../../../libretranslate-tool/src/libretranslateClient');
const cloudflareAiService = require('./cloudflareAiService');

let client;

const isEnabled = () => process.env.LIBRETRANSLATE_ENABLED === 'true';
const isFallbackEnabled = () => process.env.LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT === 'true';
const isRateLimitError = (error) => {
  const status = error?.response?.status ?? error?.statusCode;
  if (status === 420 || status === 429) return true;
  return /rate[\s-]?limit|quota|too many requests/i.test(error?.message || '');
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

const translateWithLibreTranslate = async (text, sourceLang, targetLang) => {
  if (!isEnabled()) throw new Error('LIBRETRANSLATE_DISABLED');
  if (typeof text !== 'string' || text.trim() === '' || sourceLang === targetLang) return text;

  const chunks = splitText(text, getChunkSize());
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await getClient().translate(chunk, sourceLang, targetLang));
  }
  return joinTranslatedChunks(chunks, translatedChunks);
};

const translateDraft = async (text, sourceLang, targetLang) => {
  try {
    return await translateWithLibreTranslate(text, sourceLang, targetLang);
  } catch (error) {
    console.warn('[LibreTranslate] Product draft unavailable; continuing with Cloudflare AI:', error.message);
    return '';
  }
};

const stripTranslationPrefix = (text) => (
  text.replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '').trim()
);

const translateChunkWithFallback = async (chunk, sourceLang, targetLang) => {
  const draftText = await translateDraft(chunk, sourceLang, targetLang);

  try {
    const translatedChunk = await cloudflareAiService.translate(
      chunk,
      sourceLang,
      targetLang,
      null,
      3,
      2000,
      { draftText },
    );
    return {
      translatedText: stripTranslationPrefix(translatedChunk),
      provider: 'cloudflare',
    };
  } catch (error) {
    if (!isFallbackEnabled() || !isRateLimitError(error)) throw error;

    try {
      const translatedText = draftText || await translateWithLibreTranslate(chunk, sourceLang, targetLang);
      return {
        translatedText: stripTranslationPrefix(translatedText),
        provider: 'libretranslate',
        fallbackReason: 'cloudflare_rate_limit',
      };
    } catch (fallbackError) {
      fallbackError.cloudflareRateLimited = true;
      throw fallbackError;
    }
  }
};

const translateWithFallback = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getChunkSize());
  const translatedChunks = [];
  let provider = 'cloudflare';
  let fallbackReason = null;

  for (const chunk of chunks) {
    const translation = await translateChunkWithFallback(chunk, sourceLang, targetLang);
    translatedChunks.push(translation.translatedText);
    if (translation.provider === 'libretranslate') {
      provider = 'libretranslate';
      fallbackReason = translation.fallbackReason;
    }
  }

  return {
    translatedText: joinTranslatedChunks(chunks, translatedChunks),
    provider,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
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
  translateWithCloudflare,
  translateWithFallback,
};
