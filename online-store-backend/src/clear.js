/**
 * Script xóa tất cả dữ liệu từ database
 * Sử dụng: npm run clear
 */

require('dotenv').config();
const mongoose = require('mongoose');

const clearDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Lấy tất cả collections
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

clearDatabase();
