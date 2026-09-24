require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const { connectMongo } = require('../config/mongoConnection');

const LEGACY_STATUS = 'fallback_libretranslate';
const CURRENT_STATUS = 'translated_via_libre';
const apply = process.argv.includes('--apply');

const migrate = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  await connectMongo();
  try {
    const query = { status: LEGACY_STATUS };
    const count = await LiveTranslationCache.countDocuments(query);

    console.log(`Found ${count} legacy LibreTranslate record(s).`);
    if (!apply || count === 0) {
      console.log(apply ? 'Nothing to migrate.' : 'Dry-run only. Use --apply to write changes.');
      return;
    }

    const result = await LiveTranslationCache.updateMany(
      query,
      {
        $set: {
          status: CURRENT_STATUS,
          provider: 'libretranslate',
          providerSource: 'secondary_failover',
          'metadata.secondary_provider': true,
        },
        $rename: { retranslateReason: 'failoverReason' },
      },
    );

    console.log(`Migrated ${result.modifiedCount} record(s) to ${CURRENT_STATUS}.`);
  } finally {
    await mongoose.connection.close();
  }
};

migrate().catch(async (error) => {
  console.error(`Migration failed: ${error.message}`);
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  process.exitCode = 1;
});
