require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const SpecKeyTranslationCache = require('../src/models/SpecKeyTranslationCache');
const { connectMongo } = require('../src/config/mongoConnection');

const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg
  ? path.resolve(process.cwd(), outputArg.slice('--output='.length))
  : path.resolve(process.cwd(), `backups/spec-key-cache-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  await connectMongo();

  try {
    const [productCatalog, specKeyTranslations] = await Promise.all([
      ProductCatalogTranslationCache.find({}).lean(),
      SpecKeyTranslationCache.find({}).lean(),
    ]);
    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      collections: {
        product_catalog_translation_cache: productCatalog,
        spec_key_translation_cache: specKeyTranslations,
      },
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));
    console.log(JSON.stringify({ outputPath, productCatalog: productCatalog.length, specKeyTranslations: specKeyTranslations.length }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`[backup-spec-key-cache] ${error.message}`);
  process.exitCode = 1;
});
