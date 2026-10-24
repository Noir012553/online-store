const crypto = require('crypto');

const sortObject = (value) => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObject(value[key]);
      return result;
    }, {});
};

const isEmptyDescriptionImageAlt = value => (
  value == null || String(value).trim() === '' || String(value).trim() === '0'
);

const normalizeDescriptionImage = image => {
  if (!image || typeof image !== 'object' || Array.isArray(image)) return image;
  if (String(image.alt ?? '').trim() !== '0') return image;
  return { ...image, alt: null };
};

const getProductTranslationSource = (product = {}) => ({
  name: product.name ?? '',
  description: product.description ?? '',
  brand: product.brand ?? '',
  specs: product.specs ?? {},
  technicalDescription: product.technicalDescription ?? '',
  descriptionImages: (product.descriptionImages ?? []).map(normalizeDescriptionImage),
  promotions: product.promotions ?? [],
});

const getProductTranslationSourceHash = (product) => crypto
  .createHash('sha256')
  .update(JSON.stringify(sortObject(getProductTranslationSource(product))))
  .digest('hex');
const getProductTranslationFieldKey = path => JSON.stringify(Array.isArray(path) ? path : [path]);
const getProductTranslationFieldHash = (path, source) => crypto
  .createHash('sha256')
  .update(JSON.stringify([Array.isArray(path) ? path : [path], String(source ?? '')]))
  .digest('hex');
const getProductTranslationFieldHashes = (product = {}) => {
  const hashes = {};
  const add = (path, source) => {
    if (typeof source === 'string' && source.trim()) {
      hashes[getProductTranslationFieldKey(path)] = getProductTranslationFieldHash(path, source);
    }
  };

  add(['name'], product.name);
  add(['description'], product.description);
  add(['technicalDescription'], product.technicalDescription);
  Object.entries(product.specs || {}).forEach(([key, value]) => {
    if (typeof value === 'string') add(['specs', key], value);
  });
  (Array.isArray(product.descriptionImages) ? product.descriptionImages : [])
    .forEach((image, index) => {
      if (!isEmptyDescriptionImageAlt(image?.alt)) add(['descriptionImages', index, 'alt'], image.alt);
    });
  (Array.isArray(product.promotions) ? product.promotions : []).forEach((promotion, index) => {
    ['title', 'giftProductName', 'scope', 'discountText'].forEach(field => {
      add(['promotions', index, field], promotion?.[field]);
    });
  });
  return hashes;
};

module.exports = {
  getProductTranslationFieldHash,
  getProductTranslationFieldHashes,
  getProductTranslationFieldKey,
  getProductTranslationSource,
  getProductTranslationSourceHash,
};
