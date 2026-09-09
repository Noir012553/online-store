require('dotenv').config();
const mongoose = require('mongoose');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const checkProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const Product = require('../models/Product');

    // Check products without brands
    const productsWithoutBrands = await Product.find({ 
      $or: [
        { brand: null },
        { brand: undefined },
        { brand: '' }
      ]
    }).select('name brand category');

    console.log(`\n${CLI_SYMBOLS.chart} KIỂM TRA BRANDS:`);
    console.log(`${CLI_SYMBOLS.success} Sản phẩm KHÔNG có brands: ${productsWithoutBrands.length}`);
    
    if (productsWithoutBrands.length > 0) {
      console.log(`\n${CLI_SYMBOLS.edit} Chi tiết (10 sản phẩm đầu):`);
      productsWithoutBrands.slice(0, 10).forEach(p => {
        console.log(`  ${CLI_SYMBOLS.bullet} ${p.name} (Category: ${p.category?.name || 'N/A'})`);
      });
    }

    const totalProducts = await Product.countDocuments();
    console.log(`\n${CLI_SYMBOLS.package} Tổng sản phẩm: ${totalProducts}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error:`, error.message);
    process.exit(1);
  }
};

checkProducts();
