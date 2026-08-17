require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Currency = require('../models/Currency');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const requestedCode = process.argv
    .find(argument => argument.startsWith('--currency='))
    ?.split('=')[1]
    ?.trim()
    .toUpperCase();

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI chưa được set trong biến môi trường');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const currency = requestedCode
    ? await Currency.findOne({ code: requestedCode, isActive: true }).lean()
    : await Currency.findOne({ isActive: true, isDefault: true }).lean();

  if (!currency) {
    throw new Error('Không tìm thấy currency active phù hợp để sửa sản phẩm');
  }

  const invalidFilter = {
    $or: [
      { baseCurrencyCode: { $exists: false } },
      { baseCurrencyCode: null },
      { baseCurrencyCode: '' },
      { baseCurrencyCode: { $not: /^[A-Z]{3}$/ } },
    ],
  };
  const invalidProducts = await Product.find(invalidFilter, {
    _id: 1,
    name: 1,
    baseCurrencyCode: 1,
  }).lean();

  console.log(`Tìm thấy ${invalidProducts.length} sản phẩm có baseCurrencyCode không hợp lệ.`);
  invalidProducts.forEach(product => {
    console.log(`- ${product._id} | ${product.name} | ${product.baseCurrencyCode || '<empty>'}`);
  });

  if (!dryRun && invalidProducts.length > 0) {
    const result = await Product.updateMany(invalidFilter, {
      $set: { baseCurrencyCode: currency.code },
    });
    console.log(`Đã cập nhật ${result.modifiedCount} sản phẩm sang ${currency.code}.`);
  } else if (dryRun) {
    console.log(`DRY RUN: chưa cập nhật dữ liệu. Currency sẽ dùng: ${currency.code}`);
  }
}

run()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
