/**
 * Script xóa tất cả dữ liệu từ database
 * Sử dụng: npm run clear
 * Optimized: Uses streaming cursor instead of loading all collections into array
 */

require('dotenv').config();
const mongoose = require('mongoose');

const clearDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

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
    process.exit(1);
  }
};

clearDatabase();
