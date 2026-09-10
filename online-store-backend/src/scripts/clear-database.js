/**
 * Script xóa tất cả dữ liệu từ database
 * Sử dụng: npm run clear
 * Optimized: Uses streaming cursor instead of loading all collections into array
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { deleteCloudinaryResourcesByPrefix } = require('../services/cloudinaryService');

const clearLocalUploads = () => {
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) return 0;

  let deleted = 0;
  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;
    fs.rmSync(path.join(uploadsDir, entry.name), { recursive: true, force: true });
    deleted += 1;
  }

  return deleted;
};

const clearDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const cloudinaryResult = await deleteCloudinaryResourcesByPrefix('laptop-store/');
    console.log(`[CLEAR] Deleted ${cloudinaryResult.deleted} managed Cloudinary resources`);
    cloudinaryResult.accounts.forEach(({ accountId, resourceTypes }) => {
      console.log(`[CLEAR] Cloudinary account ${accountId}:`, resourceTypes);
    });
    console.log(`[CLEAR] Deleted ${clearLocalUploads()} local upload directories/files`);

    const db = mongoose.connection.db;

    // Drop all indexes (except _id) using streaming cursor
    // Reduces memory usage: no need to load all collections into array first
    let indexDropCount = 0;
    const collectionsCursor = await db.listCollections();

    for await (const collectionInfo of collectionsCursor) {
      try {
        await db.collection(collectionInfo.name).dropIndexes();
        indexDropCount++;
      } catch (err) {
        // Ignore errors if no indexes exist
      }
    }

    // Clear all data using streaming cursor
    let deletedCollections = 0;
    const collectionsCursor2 = await db.listCollections();

    for await (const collectionInfo of collectionsCursor2) {
      const result = await db.collection(collectionInfo.name).deleteMany({});
      deletedCollections++;
    }
    process.exit(0);
  } catch (error) {
    console.error('[CLEAR_ERROR]', error.message);
    process.exit(1);
  }
};

clearDatabase();
