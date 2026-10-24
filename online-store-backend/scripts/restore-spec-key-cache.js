require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const SpecKeyTranslationCache = require('../src/models/SpecKeyTranslationCache');
const { connectMongo } = require('../src/config/mongoConnection');

const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
const overwrite = process.argv.includes('--overwrite');

const stripId = (document) => {
  const { _id, ...rest } = document;
  return rest;
};

const restoreCollection = async (Model, documents, filterFields) => {
  const operations = documents.map((document) => {
    const cleanDocument = stripId(document);
    const filter = Object.fromEntries(filterFields.map((field) => [field, cleanDocument[field]]));
    return {
      updateOne: {
        filter,
        update: overwrite ? { $set: cleanDocument } : { $setOnInsert: cleanDocument },
        upsert: true,
      },
    };
  });
  if (operations.length === 0) return { inserted: 0, matched: 0, modified: 0 };
  return Model.bulkWrite(operations, { ordered: false });
};

async function main() {
  if (!inputArg) throw new Error('Use --input=/absolute/or/project-relative/backup.json');
  const inputPath = path.resolve(process.cwd(), inputArg.slice('--input='.length));
  if (!fs.existsSync(inputPath)) throw new Error(`Backup file not found: ${inputPath}`);
  const backup = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!backup || backup.version !== 1 || !backup.collections) throw new Error('Invalid spec cache backup format');

  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  await connectMongo();
  try {
    const productResult = await restoreCollection(
      ProductCatalogTranslationCache,
      backup.collections.product_catalog_translation_cache || [],
      ['entityId', 'targetLang']
    );
    const labelResult = await restoreCollection(
      SpecKeyTranslationCache,
      backup.collections.spec_key_translation_cache || [],
      ['canonicalKey', 'targetLang']
    );
    console.log(JSON.stringify({ overwrite, productResult, labelResult }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`[restore-spec-key-cache] ${error.message}`);
  process.exitCode = 1;
});
