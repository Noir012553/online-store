const {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  splitText,
  joinTranslatedChunks,
} = require('../../../libretranslate-tool/src/productTranslator');
const { LibreTranslateClient } = require('../../../libretranslate-tool/src/libretranslateClient');
const cloudflareAiService = require('./cloudflareAiService');

let client;

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

const translateWithLibreTranslate = async (text, sourceLang, targetLang) => {
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
  translatedText: await translateWithLibreTranslate(text, sourceLang, targetLang),
  provider: 'libretranslate',
  providersUsed: ['libretranslate'],
});

const stripTranslationPrefix = (text) => (
  text.replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '').trim()
);

const translateChunkWithCloudflare = async (chunk, sourceLang, targetLang) => {
  const translatedChunk = await cloudflareAiService.translate(
    chunk,
    sourceLang,
    targetLang,
    null,
    3,
    2000,
  );
  return {
    translatedText: stripTranslationPrefix(translatedChunk),
    provider: 'cloudflare',
    providersUsed: ['cloudflare'],
  };
};

const translateWithCloudflare = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getCloudflareChunkSize());
  const translatedChunks = [];

  for (const chunk of chunks) {
    const result = await translateChunkSafely(
      chunk,
      sourceLang,
      targetLang,
      chunkText => translateChunkWithCloudflare(chunkText, sourceLang, targetLang),
    );
    translatedChunks.push(result.translatedText);
  }

  return {
    translatedText: joinTranslatedChunks(chunks, translatedChunks),
    provider: 'cloudflare',
    providersUsed: ['cloudflare'],
  };
};

module.exports = {
  translateWithLibreTranslateOnly,
  translateWithCloudflare,
};
