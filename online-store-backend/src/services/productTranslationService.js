const cloudflareAiService = require('./cloudflareAiService');

const DEFAULT_CHUNK_SIZE = 6000;

const splitText = (text, maxLength) => {
  const chunkLimit = Math.min(maxLength, DEFAULT_CHUNK_SIZE);
  if (text.length <= chunkLimit) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkLimit, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('\n', end - 1),
        text.lastIndexOf('. ', end - 2),
        text.lastIndexOf('! ', end - 2),
        text.lastIndexOf('? ', end - 2),
        text.lastIndexOf(' ', end - 1),
      );
      if (boundary > start) {
        const boundaryText = text.slice(boundary, boundary + 2);
        end = boundaryText.match(/^[.!?] /) ? boundary + 2 : boundary + 1;
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
};

const joinTranslatedChunks = (sourceChunks, translatedChunks) => {
  if (sourceChunks.length !== translatedChunks.length) {
    throw Object.assign(new Error('Translation output is missing a source chunk'), {
      code: 'TRANSLATION_OUTPUT_INCOMPLETE',
    });
  }

  translatedChunks.forEach((chunk, index) => {
    if (typeof chunk !== 'string' || chunk.trim() === '') {
      throw Object.assign(new Error('Translation provider returned an empty chunk'), {
        code: 'TRANSLATION_OUTPUT_INCOMPLETE',
      });
    }

    const source = sourceChunks[index].trim();
    if (source.length >= 40 && chunk.trim().length / source.length < 0.2) {
      throw Object.assign(new Error('Translation provider returned a severely shortened chunk'), {
        code: 'TRANSLATION_OUTPUT_INCOMPLETE',
      });
    }
  });

  return translatedChunks
    .map((chunk, index) => {
      if (index === 0) return chunk;
      const sourceBoundary = sourceChunks[index - 1].match(/\s+$/)?.[0] || '';
      const previousChunk = translatedChunks[index - 1];
      const hasBoundaryWhitespace = /\s$/.test(previousChunk) || /^\s/.test(chunk);
      return sourceBoundary && !hasBoundaryWhitespace
        ? `${sourceBoundary}${chunk}`
        : chunk;
    })
    .join('');
};

const getChunkSize = () => {
  const configured = Number(process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE);
  if (process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE !== undefined && (!Number.isInteger(configured) || configured < 1)) {
    throw new Error('CLOUDFLARE_AI_INPUT_CHUNK_SIZE must be a positive integer');
  }
  return configured || 1800;
};

const stripTranslationPrefix = text => (
  text.replace(/^\s*(?:here(?:'s| is) the translated text|here is the translation|translated text|translation)\s*:\s*/i, '').trim()
);

const translateChunkSafely = async (chunk, sourceLang, targetLang, splitDepth = 0) => {
  try {
    const translatedText = stripTranslationPrefix(await cloudflareAiService.translate(
      chunk,
      sourceLang,
      targetLang,
      null,
      3,
      2000,
    ));
    joinTranslatedChunks([chunk], [translatedText]);
    return translatedText;
  } catch (error) {
    if (error.code !== 'TRANSLATION_OUTPUT_INCOMPLETE' || splitDepth >= 2 || chunk.trim().length <= 256) throw error;

    const sourceChunks = splitText(chunk, Math.max(256, Math.floor(chunk.length / 2)));
    const translatedChunks = [];
    for (const sourceChunk of sourceChunks) {
      translatedChunks.push(await translateChunkSafely(sourceChunk, sourceLang, targetLang, splitDepth + 1));
    }
    return joinTranslatedChunks(sourceChunks, translatedChunks);
  }
};

const translateWithCloudflare = async (text, sourceLang, targetLang) => {
  const chunks = splitText(text, getChunkSize());
  const translatedChunks = [];

  for (const chunk of chunks) {
    translatedChunks.push(await translateChunkSafely(chunk, sourceLang, targetLang));
  }

  return {
    translatedText: joinTranslatedChunks(chunks, translatedChunks),
    provider: 'cloudflare',
    providersUsed: ['cloudflare'],
  };
};

module.exports = { translateWithCloudflare };
