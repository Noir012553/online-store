require('dotenv').config();
const mongoose = require('mongoose');

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

    console.log(`\n📊 KIỂM TRA BRANDS:`);
    console.log(`✅ Sản phẩm KHÔNG có brands: ${productsWithoutBrands.length}`);
    
    if (productsWithoutBrands.length > 0) {
      console.log(`\n📝 Chi tiết (10 sản phẩm đầu):`);
      productsWithoutBrands.slice(0, 10).forEach(p => {
        console.log(`  • ${p.name} (Category: ${p.category?.name || 'N/A'})`);
      });
    }

    const totalProducts = await Product.countDocuments();
    console.log(`\n📦 Tổng sản phẩm: ${totalProducts}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkProducts();
