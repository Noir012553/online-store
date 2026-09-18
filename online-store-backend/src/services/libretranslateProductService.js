const {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  splitText,
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
    return translatedChunks.join('');
  } catch (error) {
    console.warn('[LibreTranslate] Product draft unavailable; continuing with Cloudflare AI:', error.message);
    return '';
  }
};

const translateWithCloudflare = async (text, sourceLang, targetLang) => {
  const draftText = await translateDraft(text, sourceLang, targetLang);
  return cloudflareAiService.translate(
    text,
    sourceLang,
    targetLang,
    null,
    3,
    2000,
    { draftText },
  );
};

module.exports = {
  isEnabled,
  translateDraft,
  translateWithCloudflare,
};
