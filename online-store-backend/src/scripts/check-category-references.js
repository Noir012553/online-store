require('dotenv').config({ path: '.env.local' });

const mongoose = require('mongoose');
const Product = require('../models/Product');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-store');
};

const categoryStateStages = [
  {
    $lookup: {
      from: 'categories',
      localField: 'category',
      foreignField: '_id',
      as: 'categoryRecord',
    },
  },
  {
    $addFields: {
      categoryState: {
        $switch: {
          branches: [
            {
              case: { $eq: [{ $size: '$categoryRecord' }, 0] },
              then: 'missing',
            },
            {
              case: { $eq: [{ $arrayElemAt: ['$categoryRecord.isDeleted', 0] }, true] },
              then: 'soft_deleted',
            },
          ],
          default: 'active',
        },
      },
    },
  },
];

const checkCategoryReferences = async () => {
  const results = await Product.aggregate([
    ...categoryStateStages,
    {
      $group: {
        _id: { productDeleted: '$isDeleted', categoryState: '$categoryState' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.productDeleted': 1, '_id.categoryState': 1 } },
  ]);

  const issues = results.filter(({ _id }) => _id.categoryState !== 'active');

  console.log('Category reference audit');
  console.log('========================');

  results.forEach(({ _id, count }) => {
    const productState = _id.productDeleted ? 'soft-deleted products' : 'active products';
    console.log(`${productState} -> ${_id.categoryState}: ${count}`);
  });

  if (issues.length === 0) {
    console.log('\nNo missing or soft-deleted category references found.');
    return;
  }

  console.log('\nAffected product samples (up to 10 per group):');
  for (const { _id } of issues) {
    const products = await Product.aggregate([
      ...categoryStateStages,
      { $match: { isDeleted: _id.productDeleted, categoryState: _id.categoryState } },
      { $limit: 10 },
      { $project: { _id: 1, name: 1, category: 1 } },
    ]);

    console.log(`\n${_id.productDeleted ? 'soft-deleted' : 'active'} products -> ${_id.categoryState}`);
    products.forEach(product => {
      console.log(`- ${product._id}: ${product.name} (category: ${product.category})`);
    });
  }

  process.exitCode = 1;
};

const main = async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB.\n');
    await checkCategoryReferences();
  } catch (error) {
    console.error('Category reference audit failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main();
