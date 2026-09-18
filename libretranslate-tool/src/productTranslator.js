const DEFAULT_DESCRIPTION_CHUNK_SIZE = 6000;
const TRANSLATABLE_PROMOTION_FIELDS = ['title', 'giftProductName', 'scope', 'discountText'];

const splitText = (text, maxLength = DEFAULT_DESCRIPTION_CHUNK_SIZE) => {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end),
        text.lastIndexOf('! ', end),
        text.lastIndexOf('? ', end),
        text.lastIndexOf(' ', end),
      );
      if (boundary > start) end = boundary + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
};

const translateText = async (client, value, sourceLang, targetLang, chunkSize) => {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const chunks = splitText(value, chunkSize);
  const translated = [];
  for (const chunk of chunks) translated.push(await client.translate(chunk, sourceLang, targetLang));
  return translated.join('');
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
  translateProduct,
  translateProducts,
};
