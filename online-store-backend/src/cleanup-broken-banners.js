/**
 * Cleanup Script - Remove banners with broken Cloudinary URLs
 * 
 * Usage: node src/cleanup-broken-banners.js
 */

require('dotenv').config({ path: ['.env.local', '.env'] });
const mongoose = require('mongoose');
const { Banner } = require('./models/Banner');

const BROKEN_URLS = [
  'https://res.cloudinary.com/dbobp2d1l/image/upload/v1775542647/laptop-store/banners/rpjr6e8z0bvzbnxxwd6y.png',
];

const cleanupBrokenBanners = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    for (const url of BROKEN_URLS) {
      const result = await Banner.deleteMany({ image: url });
      console.log(`[CLEANUP] Deleted ${result.deletedCount} banner(s) with URL: ${url}`);
    }

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

cleanupBrokenBanners();
