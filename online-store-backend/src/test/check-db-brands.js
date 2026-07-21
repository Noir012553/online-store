require('dotenv').config();
const mongoose = require('mongoose');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const checkBrands = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const Product = require('../models/Product');

    console.log(`\n${CLI_SYMBOLS.chart} CHECKING BRANDS FROM DATABASE...\n`);

    // 1. Get all unique brands
    const allBrands = await Product.distinct('brand', { isDeleted: false });
    console.log(`${CLI_SYMBOLS.success} Total unique brands: ${allBrands.length}`);
    console.log(`${CLI_SYMBOLS.edit} All brands:\n${allBrands.sort().map(b => `  ${CLI_SYMBOLS.bullet} "${b}"`).join('\n')}\n`);

    // 2. Check for empty/null brands
    const emptyBrands = await Product.countDocuments({
      $or: [
        { brand: null },
        { brand: '' },
        { brand: undefined }
      ],
      isDeleted: false
    });
    console.log(`${CLI_SYMBOLS.warning}  Products with NULL/empty brand: ${emptyBrands}`);

    // 3. Check products with specific brand (case-insensitive)
    const koThuongHieu = await Product.countDocuments({
      brand: 'Không thương hiệu',
      isDeleted: false
    });
    console.log(`${CLI_SYMBOLS.search} Products with brand "Không thương hiệu": ${koThuongHieu}`);

    // 4. Get sample products by brand
    console.log(`\n${CLI_SYMBOLS.package} Sample products by brand:`);
    for (const brand of allBrands.slice(0, 5)) {
      const count = await Product.countDocuments({ brand, isDeleted: false });
      const sample = await Product.findOne({ brand, isDeleted: false }).select('name brand').limit(1);
      console.log(`  ${CLI_SYMBOLS.bullet} "${brand}" (${count} products) - Sample: ${sample?.name || 'N/A'}`);
    }

    // 5. Total stats
    const totalProducts = await Product.countDocuments({ isDeleted: false });
    console.log(`\n${CLI_SYMBOLS.chartUp} SUMMARY:`);
    console.log(`  ${CLI_SYMBOLS.bullet} Total products: ${totalProducts}`);
    console.log(`  ${CLI_SYMBOLS.bullet} Unique brands: ${allBrands.length}`);
    console.log(`  ${CLI_SYMBOLS.bullet} Empty brands: ${emptyBrands}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error:`, error.message);
  }
};

checkBrands();
