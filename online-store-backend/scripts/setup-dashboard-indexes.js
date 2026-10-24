require('dotenv').config();

const mongoose = require('mongoose');
const { connectMongo } = require('../src/config/mongoConnection');

const CONFIRM_APPLY = 'CREATE_DASHBOARD_INDEXES';

const indexes = [
  { collection: 'orders', name: 'idx_dashboard_recent_orders', keys: { isDeleted: 1, createdAt: -1 } },
  { collection: 'orders', name: 'idx_dashboard_payment_status', keys: { isDeleted: 1, isPaid: 1, createdAt: -1 } },
  { collection: 'orders', name: 'idx_dashboard_customer_orders', keys: { customer: 1, isDeleted: 1, createdAt: -1 } },
  { collection: 'products', name: 'idx_dashboard_low_inventory', keys: { isDeleted: 1, countInStock: 1 } },
  { collection: 'products', name: 'idx_dashboard_low_rating', keys: { isDeleted: 1, rating: 1, numReviews: 1 } },
  { collection: 'products', name: 'idx_product_source_product_id', keys: { sourceProductId: 1 }, options: { sparse: true } },
  { collection: 'customers', name: 'idx_dashboard_customer_created', keys: { isDeleted: 1, createdAt: -1 } },
  { collection: 'coupons', name: 'idx_dashboard_unused_coupons', keys: { isDeleted: 1, isActive: 1, endDate: 1, currentUses: 1 } },
];

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
    confirmation: [...args].find((arg) => arg.startsWith('--confirm='))?.split('=')[1],
  };
};

const main = async () => {
  const { apply, confirmation } = parseArgs();
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Chỉ cho phép NODE_ENV=development hoặc test. Không tạo index tự động trên staging/production.');
  }
  if (apply && confirmation !== CONFIRM_APPLY) {
    throw new Error(`Cần truyền --confirm=${CONFIRM_APPLY} khi dùng --apply.`);
  }

  await connectMongo();
  const existing = await Promise.all(indexes.map(async ({ collection, name }) => ({
    collection,
    name,
    exists: Boolean((await mongoose.connection.collection(collection).indexes()).find((index) => index.name === name)),
  })));

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', indexes: existing }, null, 2));
  if (!apply) return;

  for (const index of indexes) {
    if (existing.some((item) => item.collection === index.collection && item.name === index.name && item.exists)) continue;
    await mongoose.connection.collection(index.collection).createIndex(index.keys, { name: index.name, ...index.options });
  }
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
