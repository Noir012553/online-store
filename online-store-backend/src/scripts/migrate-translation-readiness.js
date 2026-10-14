const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const mongoose = require('mongoose');
const Product = require('../models/Product');
const { connectMongo } = require('../config/mongoConnection');

const collection = Product.collection;
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((argument) => argument.startsWith('--confirm='))?.slice('--confirm='.length);
const backupFile = process.argv.find((argument) => argument.startsWith('--backup-file='))?.slice('--backup-file='.length);

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  if (apply && confirmation !== 'TRANSLATION_READINESS') {
    throw new Error('Apply requires --confirm=TRANSLATION_READINESS');
  }
  if (apply && (!backupFile || !fs.existsSync(backupFile))) {
    throw new Error('Apply requires an existing --backup-file created before migration');
  }

  await connectMongo();

  try {
    const conflictingReadiness = await collection.countDocuments({
      storefrontReady: { $exists: true },
      translationReady: { $exists: true },
      $expr: { $ne: ['$storefrontReady', '$translationReady'] },
    });
    if (conflictingReadiness > 0) {
      throw new Error(`${conflictingReadiness} products have conflicting readiness values`);
    }

    const conflictingReadinessTimestamps = await collection.countDocuments({
      storefrontReadinessCheckedAt: { $exists: true },
      translationReadinessCheckedAt: { $exists: true },
      $expr: { $ne: ['$storefrontReadinessCheckedAt', '$translationReadinessCheckedAt'] },
    });
    if (conflictingReadinessTimestamps > 0) {
      throw new Error(`${conflictingReadinessTimestamps} products have conflicting readiness timestamps`);
    }

    const before = {
      products: await collection.countDocuments({}),
      missingPublication: await collection.countDocuments({ isPublished: { $exists: false } }),
      missingTranslationReadiness: await collection.countDocuments({
        translationReady: { $exists: false },
        storefrontReady: { $exists: false },
      }),
      legacyReadiness: await collection.countDocuments({
        $or: [
          { storefrontReady: { $exists: true } },
          { storefrontReadinessCheckedAt: { $exists: true } },
        ],
      }),
    };

    if (apply) {
      await collection.updateMany(
        { isPublished: { $exists: false } },
        { $set: { isPublished: true } },
      );
      await collection.updateMany(
        { storefrontReady: { $exists: true }, translationReady: { $exists: false } },
        { $rename: { storefrontReady: 'translationReady' } },
      );
      await collection.updateMany(
        { translationReady: { $exists: false } },
        { $set: { translationReady: false } },
      );
      await collection.updateMany(
        { storefrontReadinessCheckedAt: { $exists: true }, translationReadinessCheckedAt: { $exists: false } },
        { $rename: { storefrontReadinessCheckedAt: 'translationReadinessCheckedAt' } },
      );
      await collection.updateMany(
        {
          $or: [
            { storefrontReady: { $exists: true } },
            { storefrontReadinessCheckedAt: { $exists: true } },
          ],
        },
        { $unset: { storefrontReady: '', storefrontReadinessCheckedAt: '' } },
      );
    }

    const after = {
      missingPublication: await collection.countDocuments({ isPublished: { $exists: false } }),
      missingTranslationReadiness: await collection.countDocuments({ translationReady: { $exists: false } }),
      legacyReadiness: await collection.countDocuments({
        $or: [
          { storefrontReady: { $exists: true } },
          { storefrontReadinessCheckedAt: { $exists: true } },
        ],
      }),
      published: await collection.countDocuments({ isPublished: true }),
      translationReady: await collection.countDocuments({ translationReady: true }),
    };

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', before, after, applied: apply }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`[migrate-translation-readiness] ${error.message}`);
  process.exitCode = 1;
});
