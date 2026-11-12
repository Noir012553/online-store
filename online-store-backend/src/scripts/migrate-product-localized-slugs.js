require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductLocalizedSlug = require('../models/ProductLocalizedSlug');
const { getDefaultLanguage } = require('../config/languageInventory');
const { connectMongo } = require('../config/mongoConnection');
const {
  getApprovedTranslations,
  getSlugCandidates,
  syncProductLocalizedSlugs,
} = require('../services/productLocalizedSlugService');

const BATCH_SIZE = 250;
const APPLY = process.argv.includes('--apply');
const slugKey = (productId, locale) => `${productId}:${locale}`;

async function main() {
  await connectMongo();

  const occupiedSlugs = new Set(await ProductLocalizedSlug.distinct('slug'));
  const canonicalSlugs = await ProductLocalizedSlug.find({ status: 'canonical' }).select('productId locale slug').lean();
  const canonicalByProduct = new Map(canonicalSlugs.map((record) => [
    slugKey(String(record.productId), record.locale),
    record.slug,
  ]));
  const defaultLocale = getDefaultLanguage().code;
  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    productsProcessed: 0,
    localizedSlugsPlanned: 0,
    localizedSlugsCreated: 0,
    collisions: [],
  };
  let lastId = null;

  try {
    while (true) {
      const query = { isDeleted: false, ...(lastId ? { _id: { $gt: lastId } } : {}) };
      const products = await Product.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).lean();
      if (products.length === 0) break;

      const productIds = products.map((product) => product._id);
      const translations = await getApprovedTranslations(products);
      const translationsByProduct = new Map();
      translations.forEach((translation) => {
        const productTranslations = translationsByProduct.get(translation.entityId) || [];
        productTranslations.push(translation);
        translationsByProduct.set(translation.entityId, productTranslations);
      });

      for (const product of products) {
        const localizedNames = [
          { locale: defaultLocale, name: product.name },
          ...(translationsByProduct.get(String(product._id)) || []).map(({ targetLang, name }) => ({
            locale: targetLang,
            name,
          })),
        ].filter(({ name }) => typeof name === 'string' && name.trim());

        for (const { locale, name } of localizedNames) {
          const key = slugKey(String(product._id), locale);
          if (canonicalByProduct.has(key)) continue;

          const candidates = getSlugCandidates(name.trim(), locale, product.sku, product._id);
          const slug = candidates.find((candidate) => !occupiedSlugs.has(candidate));
          if (!slug) throw new Error(`No unique slug candidate for ${key}`);
          if (slug !== candidates[0]) {
            report.collisions.push({ productId: String(product._id), locale, base: candidates[0], assigned: slug });
          }
          occupiedSlugs.add(slug);
          canonicalByProduct.set(key, slug);
          report.localizedSlugsPlanned++;
        }
      }

      if (APPLY) {
        const result = await syncProductLocalizedSlugs(productIds);
        report.localizedSlugsCreated += result.created;
      }
      report.productsProcessed += products.length;
      lastId = products[products.length - 1]._id;
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
