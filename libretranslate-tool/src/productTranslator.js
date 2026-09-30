const DEFAULT_DESCRIPTION_CHUNK_SIZE = 6000;
const TRANSLATABLE_PROMOTION_FIELDS = ['title', 'giftProductName', 'scope', 'discountText'];

const splitText = (text, maxLength = DEFAULT_DESCRIPTION_CHUNK_SIZE) => {
  const chunkLimit = Math.min(maxLength, DEFAULT_DESCRIPTION_CHUNK_SIZE);
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

const translateText = async (client, value, sourceLang, targetLang, chunkSize) => {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const chunks = splitText(value, chunkSize);
  const translated = [];
  for (const chunk of chunks) translated.push(await client.translate(chunk, sourceLang, targetLang));
  return joinTranslatedChunks(chunks, translated);
};

const mapWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const translateProduct = async (product, { client, sourceLang, targetLang, descriptionChunkSize }) => {
  const translated = { ...product };
  translated.name = await translateText(client, product.name, sourceLang, targetLang, descriptionChunkSize);
  translated.description = await translateText(client, product.description, sourceLang, targetLang, descriptionChunkSize);
  translated.technicalDescription = await translateText(
    client,
    product.technicalDescription,
    sourceLang,
    targetLang,
    descriptionChunkSize,
  );

  if (product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs)) {
    translated.specs = {};
    for (const [key, value] of Object.entries(product.specs)) {
      translated.specs[key] = await translateText(client, value, sourceLang, targetLang, descriptionChunkSize);
    }
  }

  if (Array.isArray(product.descriptionImages)) {
    translated.descriptionImages = [];
    for (const image of product.descriptionImages) {
      translated.descriptionImages.push({
        ...image,
        alt: await translateText(client, image.alt, sourceLang, targetLang, descriptionChunkSize),
      });
    }
  }

  if (Array.isArray(product.promotions)) {
    translated.promotions = [];
    for (const promotion of product.promotions) {
      const translatedPromotion = { ...promotion };
      for (const field of TRANSLATABLE_PROMOTION_FIELDS) {
        translatedPromotion[field] = await translateText(
          client,
          promotion[field],
          sourceLang,
          targetLang,
          descriptionChunkSize,
        );
      }
      translated.promotions.push(translatedPromotion);
    }
  }

  return translated;
};

const translateProducts = (products, options) => mapWithConcurrency(
  products,
  options.concurrency,
  (product) => translateProduct(product, options),
);

module.exports = {
  DEFAULT_DESCRIPTION_CHUNK_SIZE,
  TRANSLATABLE_PROMOTION_FIELDS,
  splitText,
  joinTranslatedChunks,
  translateProduct,
  translateProducts,
};
