const {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  splitText,
  joinTranslatedChunks,
} = require('../../../libretranslate-tool/src/productTranslator');
const { LibreTranslateClient } = require('../../../libretranslate-tool/src/libretranslateClient');
const cloudflareAiService = require('./cloudflareAiService');

let client;

const isEnabled = () => process.env.LIBRETRANSLATE_ENABLED === 'true';
const isFailoverEnabled = () => process.env.LIBRETRANSLATE_FAILOVER_ON_CLOUDFLARE_OVERLOAD === 'true';
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
const getCloudflareChunkSize = () => {
  const configured = Number(process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE);
  if (process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE !== undefined && (!Number.isInteger(configured) || configured < 1)) {
    throw new Error('CLOUDFLARE_AI_INPUT_CHUNK_SIZE must be a positive integer');
  }
  return configured || 1800;
};

const translateChunkSafely = async (chunk, sourceLang, targetLang, translate, splitDepth = 0) => {
  try {
    const response = await translate(chunk);
    const translatedText = typeof response === 'string' ? response : response?.translatedText;
    joinTranslatedChunks([chunk], [translatedText]);
    return {
      translatedText,
      provider: response?.provider,
      providersUsed: response?.providersUsed || (response?.provider ? [response.provider] : []),
      failoverReason: response?.failoverReason,
    };
  } catch (error) {
    if (error.code !== 'TRANSLATION_OUTPUT_INCOMPLETE' || splitDepth >= 2 || chunk.trim().length <= 256) throw error;

    const sourceChunks = splitText(chunk, Math.max(256, Math.floor(chunk.length / 2)));
    const translatedChunks = [];
    const providersUsed = new Set();
    let failoverReason = null;
    for (const sourceChunk of sourceChunks) {
      const result = await translateChunkSafely(sourceChunk, sourceLang, targetLang, translate, splitDepth + 1);
      translatedChunks.push(result.translatedText);
      result.providersUsed.forEach(provider => providersUsed.add(provider));
      if (result.failoverReason) failoverReason = result.failoverReason;
    }

    const resolvedProviders = [...providersUsed];
    return {
      translatedText: joinTranslatedChunks(sourceChunks, translatedChunks),
      provider: resolvedProviders.includes('libretranslate') ? 'libretranslate' : 'cloudflare',
      providersUsed: resolvedProviders,
      ...(failoverReason ? { failoverReason } : {}),
    };
  }
};

const translateWithLibreTranslate = async (text, sourceLang, targetLang, force = false) => {
  if (!force && !isEnabled()) throw new Error('LIBRETRANSLATE_DISABLED');
  if (typeof text !== 'string' || text.trim() === '' || sourceLang === targetLang) return text;

  const chunks = splitText(text, getChunkSize());
  const translatedChunks = [];
  for (const chunk of chunks) {
    const result = await translateChunkSafely(
      chunk,
      sourceLang,
      targetLang,
      chunkText => getClient().translate(chunkText, sourceLang, targetLang),
    );
    translatedChunks.push(result.translatedText);
  }
  return joinTranslatedChunks(chunks, translatedChunks);
};

const translateWithLibreTranslateOnly = async (text, sourceLang, targetLang) => ({
  translatedText: await translateWithLibreTranslate(text, sourceLang, targetLang, true),
  provider: 'libretranslate',
  providersUsed: ['libretranslate'],
});

const translateDraft = async (text, sourceLang, targetLang) => {
  if (!isEnabled()) return '';

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

const translateChunkWithFailover = async (chunk, sourceLang, targetLang) => {
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
      providersUsed: ['cloudflare'],
    };
  } catch (error) {
    if (!isFailoverEnabled() || !isRateLimitError(error)) throw error;

    try {
      const translatedText = draftText || await translateWithLibreTranslate(chunk, sourceLang, targetLang);
      return {
        translatedText: stripTranslationPrefix(translatedText),
        provider: 'libretranslate',
        providersUsed: ['libretranslate'],
        failoverReason: 'cloudflare_overload',
      };
    } catch (failoverError) {
      failoverError.cloudflareRateLimited = true;
      throw failoverError;
    }
  }
};

const translateWithFailover = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getCloudflareChunkSize());
  const translatedChunks = [];
  const providersUsed = new Set();
  let failoverReason = null;

  for (const chunk of chunks) {
    const translation = await translateChunkSafely(
      chunk,
      sourceLang,
      targetLang,
      chunkText => translateChunkWithFailover(chunkText, sourceLang, targetLang),
    );
    translatedChunks.push(translation.translatedText);
    translation.providersUsed.forEach(provider => providersUsed.add(provider));
    if (translation.failoverReason) failoverReason = translation.failoverReason;
  }

  return {
    translatedText: joinTranslatedChunks(chunks, translatedChunks),
    provider: providersUsed.has('libretranslate') ? 'libretranslate' : 'cloudflare',
    providersUsed: [...providersUsed],
    ...(failoverReason ? { failoverReason } : {}),
  };
};

const translateWithCloudflare = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getCloudflareChunkSize());
  const translatedChunks = [];

  for (const chunk of chunks) {
    const result = await translateChunkSafely(chunk, sourceLang, targetLang, async (chunkText) => {
      const draftText = await translateDraft(chunkText, sourceLang, targetLang);
      const translatedChunk = await cloudflareAiService.translate(
        chunkText,
        sourceLang,
        targetLang,
        null,
        3,
        2000,
        { draftText },
      );
      return stripTranslationPrefix(translatedChunk);
    });
    translatedChunks.push(result.translatedText);
  }

  return joinTranslatedChunks(chunks, translatedChunks);
};

module.exports = {
  isEnabled,
  isFailoverEnabled,
  translateDraft,
  translateWithLibreTranslateOnly,
  translateWithCloudflare,
  translateWithFailover,
};
