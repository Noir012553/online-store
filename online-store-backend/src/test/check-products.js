require('dotenv').config();
const mongoose = require('mongoose');

const checkProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const Product = require('./src/models/Product');

    const totalProducts = await Product.countDocuments();
    const productsWithDescription = await Product.countDocuments({ description: { $ne: '' } });
    const productsWithoutStock = await Product.countDocuments({ countInStock: 0 });
    const productsWithStock = await Product.countDocuments({ countInStock: { $gt: 0 } });

    // Sample a product
    const sampleProduct = await Product.findOne().limit(1);

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

checkProducts();
