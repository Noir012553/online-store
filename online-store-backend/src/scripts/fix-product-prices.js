/**
 * Fix script: Products with null/undefined prices
 * 
 * Issue: Một số sản phẩm có price = null/undefined (không hợp lệ)
 * Solution: 
 *   1. Find tất cả products với price = null/undefined/0
 *   2. Set default price = 100,000 VND (hoặc xóa sản phẩm)
 *   3. Log kết quả
 */

require('dotenv').config({ path: './config/.env' });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online-store';
const DEFAULT_PRICE = 100000; // 100,000 VND fallback

async function fixProductPrices() {
  try {
    console.log(`${CLI_SYMBOLS.search} Connecting to MongoDB...`);
    await mongoose.connect(MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB`);

    console.log(`\n${CLI_SYMBOLS.chart} Analyzing products with missing prices...`);
    
    // Find all products with null or undefined or 0 price
    const productsWithoutPrice = await Product.find({
      $or: [
        { price: null },
        { price: undefined },
        { price: 0 },
        { price: { $exists: false } }
      ],
      isDeleted: false
    }).select('_id name brand price countInStock createdAt');

    console.log(`\n${CLI_SYMBOLS.error} Found ${productsWithoutPrice.length} products with invalid prices:`);
    
    if (productsWithoutPrice.length > 0) {
      productsWithoutPrice.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name} (${p.brand}) - Price: ${p.price || 'NULL'} - Stock: ${p.countInStock}`);
      });

      console.log(`\n${CLI_SYMBOLS.wrench} Setting default price (${DEFAULT_PRICE.toLocaleString()} VND) for all invalid products...`);
      
      const result = await Product.updateMany(
        {
          $or: [
            { price: null },
            { price: undefined },
            { price: 0 },
            { price: { $exists: false } }
          ],
          isDeleted: false
        },
        {
          $set: { price: DEFAULT_PRICE }
        }
      );

      console.log(`${CLI_SYMBOLS.success} Updated ${result.modifiedCount} products`);
      console.log(`   Matched: ${result.matchedCount}`);
    } else {
      console.log(`${CLI_SYMBOLS.success} All products have valid prices!`);
    }

    // Verify fix
    console.log(`\n${CLI_SYMBOLS.list} Verifying fix...`);
    const stillInvalid = await Product.countDocuments({
      $or: [
        { price: null },
        { price: undefined },
        { price: 0 },
        { price: { $exists: false } }
      ],
      isDeleted: false
    });

    if (stillInvalid === 0) {
      console.log(`${CLI_SYMBOLS.success} All products now have valid prices!`);
    } else {
      console.log(`${CLI_SYMBOLS.warning}  Still ${stillInvalid} products with invalid prices`);
    }

    // Summary stats
    const stats = await Product.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          nullPriceCount: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$price', null] }, { $eq: ['$price', 0] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    console.log(`\n${CLI_SYMBOLS.chartUp} Product Price Statistics:`);
    if (stats.length > 0) {
      const s = stats[0];
      console.log(`   Total Active Products: ${s.totalProducts}`);
      console.log(`   Average Price: ${Math.round(s.avgPrice).toLocaleString()} VND`);
      console.log(`   Min Price: ${s.minPrice?.toLocaleString() || 'N/A'} VND`);
      console.log(`   Max Price: ${s.maxPrice?.toLocaleString() || 'N/A'} VND`);
      console.log(`   Invalid Prices (null/0): ${s.nullPriceCount}`);
    }

    console.log(`\n${CLI_SYMBOLS.success} Fix complete!`);
    process.exit(0);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error:`, error.message);
    process.exit(1);
  }
}

fixProductPrices();
