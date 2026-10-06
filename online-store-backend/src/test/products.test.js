require('dotenv').config();
const mongoose = require('mongoose');
const { mongoUri } = require('./test-config');

const checkProducts = async () => {
  try {
    await mongoose.connect(mongoUri);
    const Product = require('../models/Product');

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
