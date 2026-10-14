const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const mongoose = require('mongoose');
const Product = require('../models/Product');
const { connectMongo } = require('../config/mongoConnection');

const collection = Product.collection;
const apply = process.argv.includes('--apply');
const rollback = process.argv.includes('--rollback');
const confirmation = process.argv.find((argument) => argument.startsWith('--confirm='))?.slice('--confirm='.length);
const backupFile = process.argv.find((argument) => argument.startsWith('--backup-file='))?.slice('--backup-file='.length);
const backupVerified = process.argv.includes('--backup-verified=true');

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  if (apply && rollback) throw new Error('Use either --apply or --rollback, not both');
  if ((apply || rollback) && confirmation !== (rollback ? 'TRANSLATION_READINESS_ROLLBACK' : 'TRANSLATION_READINESS')) {
    throw new Error(`Operation requires --confirm=${rollback ? 'TRANSLATION_READINESS_ROLLBACK' : 'TRANSLATION_READINESS'}`);
  }
  if ((apply || rollback) && (!backupFile || !fs.existsSync(backupFile) || fs.statSync(backupFile).size === 0 || !backupVerified)) {
    throw new Error('Apply and rollback require a non-empty --backup-file and --backup-verified=true');
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
        [{ $set: { translationReady: '$storefrontReady' } }],
      );
      await collection.updateMany(
        { translationReady: { $exists: false } },
        { $set: { translationReady: false } },
      );
      await collection.updateMany(
        { storefrontReadinessCheckedAt: { $exists: true }, translationReadinessCheckedAt: { $exists: false } },
        [{ $set: { translationReadinessCheckedAt: '$storefrontReadinessCheckedAt' } }],
      );
    }

    if (rollback) {
      await collection.updateMany({}, [{
        $set: {
          storefrontReady: {
            $and: [
              { $eq: ['$isPublished', true] },
              { $eq: ['$translationReady', true] },
            ],
          },
          storefrontReadinessCheckedAt: { $ifNull: ['$translationReadinessCheckedAt', '$$NOW'] },
        },
      }]);
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

    console.log(JSON.stringify({ mode: rollback ? 'rollback' : apply ? 'apply' : 'dry-run', before, after, applied: apply || rollback }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`[migrate-translation-readiness] ${error.message}`);
  process.exitCode = 1;
});
