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

const getProductTranslationSource = (product = {}) => ({
  name: product.name ?? '',
  description: product.description ?? '',
  brand: product.brand ?? '',
  specs: product.specs ?? {},
  technicalDescription: product.technicalDescription ?? '',
  descriptionImages: product.descriptionImages ?? [],
  promotions: product.promotions ?? [],
});

const getProductTranslationSourceHash = (product) => crypto
  .createHash('sha256')
  .update(JSON.stringify(sortObject(getProductTranslationSource(product))))
  .digest('hex');

module.exports = {
  getProductTranslationSource,
  getProductTranslationSourceHash,
};
