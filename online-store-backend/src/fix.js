/**
 * Fix Script - Merperbaiki Orders yang không có customer data
 * Chạy: npm run fix (cần thêm script này vào package.json)
 * hoặc: node src/fix.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { fixOrdersWithoutCustomers, verifyOrderCustomers } = require('./seeds/fixOrderCustomers');

const main = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    // Verify current state
    await verifyOrderCustomers();

    // Fix orders
    const result = await fixOrdersWithoutCustomers();

    // Verify after fix
    await verifyOrderCustomers();

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

main();
