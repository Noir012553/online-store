require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const checkBrands = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const Product = require('../models/Product');

    console.log('\n📊 CHECKING BRANDS FROM DATABASE...\n');

    // 1. Get all unique brands
    const allBrands = await Product.distinct('brand', { isDeleted: false });
    console.log(`✅ Total unique brands: ${allBrands.length}`);
    console.log(`📝 All brands:\n${allBrands.sort().map(b => `  • "${b}"`).join('\n')}\n`);

    // 2. Check for empty/null brands
    const emptyBrands = await Product.countDocuments({
      $or: [
        { brand: null },
        { brand: '' },
        { brand: undefined }
      ],
      isDeleted: false
    });
    console.log(`⚠️  Products with NULL/empty brand: ${emptyBrands}`);

    // 3. Check products with specific brand (case-insensitive)
    const koThuongHieu = await Product.countDocuments({
      brand: 'Không thương hiệu',
      isDeleted: false
    });
    console.log(`🔍 Products with brand "Không thương hiệu": ${koThuongHieu}`);

    // 4. Get sample products by brand
    console.log(`\n📦 Sample products by brand:`);
    for (const brand of allBrands.slice(0, 5)) {
      const count = await Product.countDocuments({ brand, isDeleted: false });
      const sample = await Product.findOne({ brand, isDeleted: false }).select('name brand').limit(1);
      console.log(`  • "${brand}" (${count} products) - Sample: ${sample?.name || 'N/A'}`);
    }

    // 5. Total stats
    const totalProducts = await Product.countDocuments({ isDeleted: false });
    console.log(`\n📈 SUMMARY:`);
    console.log(`  • Total products: ${totalProducts}`);
    console.log(`  • Unique brands: ${allBrands.length}`);
    console.log(`  • Empty brands: ${emptyBrands}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

checkBrands();
