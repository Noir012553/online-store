const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const ProductLocalizedSlug = require('../models/ProductLocalizedSlug');
const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');

const slugifyProductName = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const getSlugCandidates = (name, locale, sku, productId) => {
  const base = slugifyProductName(name) || 'product';
  const normalizedSku = slugifyProductName(sku);
  const id = String(productId);
  const candidates = [
    base,
    `${base}-${locale}`,
    ...(normalizedSku ? [`${base}-${normalizedSku}`] : []),
    `${base}-${id.slice(-8)}`,
    `${base}-${id}`,
  ];

  return [...new Set(candidates)];
};

const createCanonicalSlug = async ({ product, locale, sourceName, currentSlugs }) => {
  const productId = product._id;
  const key = `${productId}:${locale}`;
  const current = currentSlugs.get(key);
  if (current) return { record: current, created: false };

  for (const slug of getSlugCandidates(sourceName, locale, product.sku, productId)) {
    try {
      const record = await ProductLocalizedSlug.create({ productId, locale, slug, sourceName, status: 'canonical' });
      currentSlugs.set(key, record);
      return { record, created: true };
    } catch (error) {
      if (error.code !== 11000) throw error;
      const canonical = await ProductLocalizedSlug.findOne({ productId, locale, status: 'canonical' }).lean();
      if (canonical) {
        currentSlugs.set(key, canonical);
        return { record: canonical, created: false };
      }
    }
  }

  throw new Error(`Unable to allocate a unique localized product slug for ${productId}:${locale}`);
};

const getApprovedTranslations = async (products) => {
  if (products.length === 0) return [];

  const sourceHashes = new Map(products.map((product) => [
    String(product._id),
    getProductTranslationSourceHash(product),
  ]));
  const translations = await ProductCatalogTranslationCache.find({
    entityId: { $in: [...sourceHashes.keys()] },
    targetLang: { $in: getActiveLangCodes() },
    status: 'success',
    qualityStatus: 'approved',
    validationErrors: { $size: 0 },
  }).select('entityId targetLang sourceHash name').lean();

  return translations.filter((translation) => (
    translation.sourceHash === sourceHashes.get(translation.entityId)
    && typeof translation.name === 'string'
    && translation.name.trim()
  ));
};

const syncProductLocalizedSlugs = async (productIds) => {
  const ids = [...new Set((productIds || []).map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (ids.length === 0) return { created: 0 };

  const products = await Product.find({ _id: { $in: ids }, isDeleted: false }).sort({ _id: 1 }).lean();
  const activeProducts = products.filter((product) => product.name?.trim());
  if (activeProducts.length === 0) return { created: 0 };

  const activeProductIds = activeProducts.map((product) => product._id);
  const [translations, currentRecords] = await Promise.all([
    getApprovedTranslations(activeProducts),
    ProductLocalizedSlug.find({ productId: { $in: activeProductIds }, status: 'canonical' }).lean(),
  ]);
  const translationsByProduct = new Map();
  translations.forEach((translation) => {
    const records = translationsByProduct.get(translation.entityId) || [];
    records.push(translation);
    translationsByProduct.set(translation.entityId, records);
  });
  const currentSlugs = new Map(currentRecords.map((record) => [
    `${record.productId}:${record.locale}`,
    record,
  ]));

  let created = 0;
  const defaultLocale = getDefaultLanguage().code;
  for (const product of activeProducts) {
    const defaultResult = await createCanonicalSlug({
      product,
      locale: defaultLocale,
      sourceName: product.name.trim(),
      currentSlugs,
    });
    if (defaultResult.created) created++;

    for (const translation of translationsByProduct.get(String(product._id)) || []) {
      if (translation.targetLang === defaultLocale) continue;
      const result = await createCanonicalSlug({
        product,
        locale: translation.targetLang,
        sourceName: translation.name.trim(),
        currentSlugs,
      });
      if (result.created) created++;
    }
  }

  return { created };
};

const changeCanonicalProductSlug = async ({ productId, locale, slug }) => {
  const fail = (status, errorCode, message) => Object.assign(new Error(message), {
    status,
    errorCode,
    exposeMessage: true,
  });

  if (typeof slug !== 'string') {
    throw fail(400, 'INVALID_PRODUCT_SLUG', 'A non-empty product slug is required');
  }
  const normalizedSlug = slugifyProductName(slug);
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw fail(400, 'INVALID_PRODUCT_ID', 'A valid product ID is required');
  }
  if (!getActiveLangCodes().includes(locale)) {
    throw fail(400, 'INVALID_PRODUCT_SLUG_LOCALE', 'An active locale is required');
  }
  if (!normalizedSlug) {
    throw fail(400, 'INVALID_PRODUCT_SLUG', 'A non-empty product slug is required');
  }

  const session = await mongoose.startSession();
  let changedSlug;
  try {
    await session.withTransaction(async () => {
      const current = await ProductLocalizedSlug.findOne({
        productId,
        locale,
        status: 'canonical',
      }).session(session);
      if (!current) throw fail(404, 'PRODUCT_SLUG_NOT_FOUND', 'No canonical slug exists for this product and locale');
      if (current.slug === normalizedSlug) {
        changedSlug = { slug: current.slug, previousSlug: null };
        return;
      }

      const destination = await ProductLocalizedSlug.findOne({ slug: normalizedSlug }).session(session);
      const belongsToProduct = destination
        && String(destination.productId) === String(productId)
        && destination.locale === locale
        && destination.status === 'alias';
      if (destination && !belongsToProduct) {
        throw fail(409, 'PRODUCT_SLUG_CONFLICT', 'This slug is already assigned to another URL');
      }

      current.status = 'alias';
      await current.save({ session });

      if (destination) {
        destination.status = 'canonical';
        destination.sourceName = current.sourceName;
        await destination.save({ session });
      } else {
        const [created] = await ProductLocalizedSlug.create([{
          productId,
          locale,
          slug: normalizedSlug,
          sourceName: current.sourceName,
          status: 'canonical',
        }], { session });
        changedSlug = { slug: created.slug, previousSlug: current.slug };
        return;
      }

      changedSlug = { slug: destination.slug, previousSlug: current.slug };
    });
    return changedSlug;
  } catch (error) {
    if (error.code === 11000) {
      throw fail(409, 'PRODUCT_SLUG_CONFLICT', 'This slug is already assigned to another URL');
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const attachLocalizedSlugs = async (products) => {
  if (!Array.isArray(products) || products.length === 0) return products;

  const productIds = products
    .map((product) => String(product?._id || product?.id || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (productIds.length === 0) return products;

  const records = await ProductLocalizedSlug.find({
    productId: { $in: productIds },
    status: 'canonical',
  }).select('productId locale slug').lean();
  const slugsByProduct = new Map();
  records.forEach(({ productId, locale, slug }) => {
    const id = String(productId);
    const slugs = slugsByProduct.get(id) || {};
    slugs[locale] = slug;
    slugsByProduct.set(id, slugs);
  });

  return products.map((product) => ({
    ...(product.toObject ? product.toObject() : product),
    localizedSlugs: slugsByProduct.get(String(product?._id || product?.id || '')) || {},
  }));
};

module.exports = {
  attachLocalizedSlugs,
  changeCanonicalProductSlug,
  getApprovedTranslations,
  getSlugCandidates,
  slugifyProductName,
  syncProductLocalizedSlugs,
};
