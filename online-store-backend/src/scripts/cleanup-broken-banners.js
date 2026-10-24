require('dotenv').config({ path: ['.env.local', '.env'] });
const mongoose = require('mongoose');
const { Banner } = require('../models/Banner');

const parseUrls = () => (process.argv.find(argument => argument.startsWith('--urls=')) || '')
  .slice('--urls='.length)
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

const cleanupBrokenBanners = async () => {
  const urls = parseUrls();
  if (urls.length === 0) throw new Error('BANNER_URLS_REQUIRED: pass --urls=url1,url2');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

  await mongoose.connect(process.env.MONGO_URI);
  const result = await Banner.deleteMany({ image: { $in: urls } });
  console.log(`[CLEANUP] Deleted ${result.deletedCount} banner(s)`);
};

cleanupBrokenBanners()
  .catch(error => {
    console.error(`[CLEANUP_ERROR] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
