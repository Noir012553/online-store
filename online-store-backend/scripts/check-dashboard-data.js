const mongoose = require('mongoose');
const { connectMongo } = require('../src/config/mongoConnection');
const Product = require('../src/models/Product');
const Customer = require('../src/models/Customer');
const Order = require('../src/models/Order');
const Coupon = require('../src/models/Coupon');

const SAMPLE_PREFIX = 'dashboard-sample:';
const LEGACY_CUSTOMER_EMAIL = /^seed\.dashboard\+/;
const CONFIRM_ROLLBACK = 'ROLLBACK_DASHBOARD_SAMPLE';

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  const confirmation = [...args].find((arg) => arg.startsWith('--confirm='))?.split('=')[1];

  return {
    apply: args.has('--apply'),
    rollback: args.has('--rollback'),
    help: args.has('--help') || args.has('-h'),
    confirmation,
  };
};

const printUsage = () => {
  console.log('Dashboard data check: chỉ đọc dữ liệu hiện có trong database.');
  console.log('npm run check:dashboard-data');
  console.log('npm run rollback:dashboard-legacy');
};

const assertSafeEnvironment = (options) => {
  if (!options.rollback) return;
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Chỉ cho phép rollback ở NODE_ENV=development hoặc test.');
  }
  if (!options.apply || options.confirmation !== CONFIRM_ROLLBACK) {
    throw new Error(`Cần truyền --apply --confirm=${CONFIRM_ROLLBACK} khi rollback.`);
  }
};

const getDatabaseCounts = async () => {
  const [products, customers, orders, coupons] = await Promise.all([
    Product.countDocuments({ isDeleted: false }),
    Customer.countDocuments({ isDeleted: false }),
    Order.countDocuments({ isDeleted: false }),
    Coupon.countDocuments({ isDeleted: false }),
  ]);

  return { products, customers, orders, coupons };
};

const removeLegacySamples = async () => {
  const legacyOrders = await Order.find({ idempotencyKey: { $regex: `^${SAMPLE_PREFIX}` } })
    .select('_id orderItems.product customer appliedCoupon.couponId')
    .lean();
  const legacyOrderIds = legacyOrders.map((order) => order._id);
  const legacyProductIds = [...new Set(legacyOrders.flatMap((order) => (
    order.orderItems || []).map((item) => String(item.product))))];
  const legacyOrderCouponIds = legacyOrders
    .map((order) => order.appliedCoupon?.couponId)
    .filter(Boolean)
    .map(String);
  const legacyCoupons = await Coupon.find({ description: { $regex: '^\\[dashboard-sample\\]' } })
    .select('_id')
    .lean();
  const legacyCouponIds = [...new Set([
    ...legacyOrderCouponIds,
    ...legacyCoupons.map((coupon) => String(coupon._id)),
  ])];
  const legacyCustomerIds = [...new Set(legacyOrders.map((order) => String(order.customer)).filter(Boolean))];

  const removedOrders = await Order.deleteMany({ _id: { $in: legacyOrderIds } });

  const referencedProductIds = await Order.distinct('orderItems.product', {
    'orderItems.product': { $in: legacyProductIds },
  });
  const removableProductIds = legacyProductIds.filter((id) => !referencedProductIds.some((ref) => String(ref) === id));
  const removedProducts = removableProductIds.length
    ? await Product.deleteMany({ _id: { $in: removableProductIds }, sourceProductId: { $regex: `^${SAMPLE_PREFIX}` } })
    : { deletedCount: 0 };

  const referencedCouponIds = await Order.distinct('appliedCoupon.couponId', {
    'appliedCoupon.couponId': { $in: legacyCouponIds },
  });
  const removableCouponIds = legacyCouponIds.filter((id) => !referencedCouponIds.some((ref) => String(ref) === id));
  const removedCoupons = removableCouponIds.length
    ? await Coupon.deleteMany({ _id: { $in: removableCouponIds }, description: { $regex: '^\\[dashboard-sample\\]' } })
    : { deletedCount: 0 };

  const legacyCustomers = await Customer.find({
    $or: [
      { _id: { $in: legacyCustomerIds } },
      { email: { $regex: LEGACY_CUSTOMER_EMAIL } },
    ],
  }).select('_id').lean();
  const customerIds = legacyCustomers.map((customer) => customer._id);
  const referencedCustomerIds = await Order.distinct('customer', { customer: { $in: customerIds } });
  const removableCustomerIds = customerIds.filter((id) => !referencedCustomerIds.some((ref) => String(ref) === String(id)));
  const removedCustomers = removableCustomerIds.length
    ? await Customer.deleteMany({ _id: { $in: removableCustomerIds }, email: { $regex: LEGACY_CUSTOMER_EMAIL } })
    : { deletedCount: 0 };

  console.log(JSON.stringify({
    removed: {
      orders: removedOrders.deletedCount,
      products: removedProducts.deletedCount,
      coupons: removedCoupons.deletedCount,
      customers: removedCustomers.deletedCount,
    },
  }, null, 2));
};

const main = async () => {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    return;
  }

  assertSafeEnvironment(options);
  await connectMongo();

  if (options.rollback) {
    await removeLegacySamples();
    return;
  }

  const counts = await getDatabaseCounts();
  console.log(JSON.stringify({
    mode: options.apply ? 'database-check' : 'dry-run',
    source: 'database',
    writes: 0,
    existingDocuments: counts,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
