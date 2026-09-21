const {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  splitText,
  joinTranslatedChunks,
} = require('../../../libretranslate-tool/src/productTranslator');
const { LibreTranslateClient } = require('../../../libretranslate-tool/src/libretranslateClient');
const cloudflareAiService = require('./cloudflareAiService');

let client;

const isEnabled = () => process.env.LIBRETRANSLATE_ENABLED === 'true';

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
    const chunks = splitText(text, getChunkSize());
    const translatedChunks = [];
    for (const chunk of chunks) {
      translatedChunks.push(await getClient().translate(chunk, sourceLang, targetLang));
    }
    return joinTranslatedChunks(chunks, translatedChunks);
  } catch (error) {
    console.warn('[LibreTranslate] Product draft unavailable; continuing with Cloudflare AI:', error.message);
    return '';
  }
};

const stripTranslationPrefix = (text) => (
  text.replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '').trim()
);

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
  translateDraft,
  translateWithCloudflare,
};
