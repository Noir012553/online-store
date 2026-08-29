require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo } = require('../src/config/mongoConnection');
const Product = require('../src/models/Product');
const Customer = require('../src/models/Customer');
const Order = require('../src/models/Order');
const Coupon = require('../src/models/Coupon');
const User = require('../src/models/User');
const Currency = require('../src/models/Currency');

const SAMPLE_PREFIX = 'dashboard-sample:';
const CONFIRM_APPLY = 'SEED_DASHBOARD_SAMPLE';
const CONFIRM_ROLLBACK = 'ROLLBACK_DASHBOARD_SAMPLE';
const DATA_DIRECTORY = path.join(__dirname, '../src/seeds/dashboard-sample');

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  const confirmation = [...args].find((arg) => arg.startsWith('--confirm='))?.split('=')[1];

  return {
    apply: args.has('--apply'),
    rollback: args.has('--rollback'),
    emptyOnly: args.has('--empty-only'),
    help: args.has('--help') || args.has('-h'),
    confirmation,
  };
};

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIRECTORY, name), 'utf8'));
const dateDaysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const printUsage = () => {
  console.log('npm run seed:dashboard-sample');
  console.log('npm run seed:dashboard-sample:apply');
  console.log('npm run seed:dashboard-sample:empty');
  console.log('npm run seed:dashboard-sample:rollback');
};

const assertSafeEnvironment = (options) => {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Chỉ cho phép NODE_ENV=development hoặc test. Không chạy seed trên staging/production.');
  }

  if (!options.apply) return;

  const expectedConfirmation = options.rollback ? CONFIRM_ROLLBACK : CONFIRM_APPLY;
  if (options.confirmation !== expectedConfirmation) {
    throw new Error(`Cần truyền --confirm=${expectedConfirmation} khi dùng --apply.`);
  }
};

const getExistingCounts = async () => {
  const [products, customers, orders, coupons] = await Promise.all([
    Product.countDocuments({}),
    Customer.countDocuments({}),
    Order.countDocuments({}),
    Coupon.countDocuments({}),
  ]);

  return { products, customers, orders, coupons };
};

const assertDependencies = async () => {
  const [user, products, currency] = await Promise.all([
    User.findOne({ isDeleted: false, role: { $in: ['admin', 'super-admin'] } }).sort({ createdAt: 1 }).lean(),
    Product.find({
      isDeleted: false,
      brand: { $type: 'string', $ne: '' },
      image: { $type: 'string', $ne: '' },
      price: { $gt: 0 },
      category: { $exists: true },
      $nor: [{ sourceProductId: { $regex: `^${SAMPLE_PREFIX}` } }],
    })
      .select('name image price originalPrice brand category')
      .sort({ _id: 1 })
      .populate({ path: 'category', select: '_id name', match: { isDeleted: false } })
      .lean(),
    Currency.findOne({ isActive: true, isDefault: true }).lean(),
  ]);

  const productsWithCategories = products.filter((product) => product.category);

  if (!user) throw new Error('Cần có ít nhất một admin hoặc super-admin đang hoạt động.');
  if (productsWithCategories.length === 0) {
    throw new Error('Cần có ít nhất một product đang hoạt động với brand và category hợp lệ.');
  }
  if (!currency) throw new Error('Cần có một currency mặc định đang hoạt động.');

  return { user, products: productsWithCategories, currency };
};

const assertCouponOwnership = async (coupons) => {
  const codes = coupons.map((coupon) => coupon.code);
  const existing = await Coupon.find({ code: { $in: codes } }).lean();
  const foreignCoupon = existing.find((coupon) => !coupon.description?.startsWith('[dashboard-sample]'));

  if (foreignCoupon) {
    throw new Error(`Coupon ${foreignCoupon.code} đã tồn tại nhưng không thuộc dashboard sample.`);
  }
};

const assertCustomerOwnership = async (customers) => {
  const existing = await Customer.find({
    $or: [
      { email: { $in: customers.map((customer) => customer.email) } },
      { phone: { $in: customers.map((customer) => customer.phone) } },
    ],
  }).lean();
  const foreignCustomer = existing.find((customer) => !customers.some((sample) => (
    customer.email === sample.email && customer.phone === sample.phone
  )));

  if (foreignCustomer) {
    throw new Error('Email hoặc số điện thoại customer sample đã thuộc về dữ liệu hiện có.');
  }
};

const upsertSamples = async ({ productDefinitions, customers, orders, coupons, dependencies }) => {
  const { user, products, currency } = dependencies;

  await Promise.all([assertCouponOwnership(coupons), assertCustomerOwnership(customers)]);

  const productsByKey = new Map(productDefinitions.map((definition, index) => [
    definition.key,
    products[index % products.length],
  ]));

  await Customer.bulkWrite(customers.map((customer) => ({
    updateOne: {
      filter: { email: customer.email },
      update: {
        $setOnInsert: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          isDeleted: false,
          createdAt: dateDaysFromNow(-customer.daysAgo),
        },
      },
      upsert: true,
    },
  })));

  await Coupon.bulkWrite(coupons.map(({ startDaysAgo, endDaysFromNow, scope = 'all', ...coupon }, index) => {
    const product = productsByKey.get(coupon.productKey) || products[index % products.length];
    return {
      updateOne: {
        filter: { code: coupon.code },
        update: {
          $setOnInsert: {
            ...coupon,
            currencyCode: currency.code,
            applicableCategories: scope === 'category' ? [product.category._id] : [],
            startDate: dateDaysFromNow(-startDaysAgo),
            endDate: dateDaysFromNow(endDaysFromNow),
            isDeleted: false,
          },
        },
        upsert: true,
      },
    };
  }));

  const [storedCustomers, storedCoupons] = await Promise.all([
    Customer.find({ email: { $in: customers.map((customer) => customer.email) }, isDeleted: false }).lean(),
    Coupon.find({ code: { $in: coupons.map((coupon) => coupon.code) }, isDeleted: false }).lean(),
  ]);

  const customersByKey = new Map(customers.map((customer) => [customer.key, storedCustomers.find((stored) => stored.email === customer.email)]));
  const couponsByCode = new Map(storedCoupons.map((coupon) => [coupon.code, coupon]));

  await Coupon.bulkWrite(coupons.filter((coupon) => coupon.scope === 'product').map((coupon) => ({
    updateOne: {
      filter: { code: coupon.code },
      update: {
        $set: { applicableProducts: [productsByKey.get(coupon.productKey)._id] },
      },
    },
  })));

  const orderOperations = orders.map((order) => {
    const customer = customersByKey.get(order.customerKey);
    const coupon = order.couponCode ? couponsByCode.get(order.couponCode) : null;
    const orderItems = order.items.map(({ productKey, qty }) => {
      const product = productsByKey.get(productKey);
      if (!product) throw new Error(`Không tìm thấy product sample: ${productKey}`);

      return {
        name: product.name,
        qty,
        image: product.image,
        price: product.price,
        originalPrice: product.originalPrice,
        discountPercentage: product.originalPrice > product.price
          ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
          : 0,
        product: product._id,
      };
    });

    if (!customer) throw new Error(`Không tìm thấy customer sample: ${order.customerKey}`);
    if (order.couponCode && !coupon) throw new Error(`Không tìm thấy coupon sample: ${order.couponCode}`);

    const itemsPrice = orderItems.reduce((total, item) => total + item.price * item.qty, 0);
    const discount = coupon
      ? coupon.discountType === 'percentage'
        ? Math.round(itemsPrice * coupon.discountValue / 100)
        : Math.min(itemsPrice, coupon.discountValue)
      : 0;
    const taxPrice = Math.round((itemsPrice - discount) * 0.1);
    const shippingFee = itemsPrice >= 20000000 ? 0 : 30000;
    const totalPrice = itemsPrice - discount + taxPrice + shippingFee;
    const createdAt = dateDaysFromNow(-order.daysAgo);
    const paidAt = order.isPaid ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null;
    const deliveredAt = order.isDelivered ? new Date(createdAt.getTime() + 48 * 60 * 60 * 1000) : null;

    return {
      updateOne: {
        filter: { idempotencyKey: `${SAMPLE_PREFIX}${order.key}` },
        update: {
          $setOnInsert: {
            user: user._id,
            customer: customer._id,
            orderItems,
            itemsPrice,
            taxPrice,
            totalPrice,
            discount,
            appliedCoupon: coupon ? {
              code: coupon.code,
              couponId: coupon._id,
              couponCurrencyCode: coupon.currencyCode,
              discountType: coupon.discountType,
              discountValue: coupon.discountValue,
              couponMinOrderAmount: coupon.minOrderAmount,
              baseMinOrderAmount: coupon.minOrderAmount,
              baseDiscountAmount: discount,
              discountAmount: discount,
            } : undefined,
            isPaid: order.isPaid,
            paidAt,
            paymentMethod: order.paymentMethod,
            isDelivered: order.isDelivered,
            deliveredAt,
            shippingAddress: { name: customer.name, phone: customer.phone, address: 'Địa chỉ dashboard sample' },
            shippingFee,
            providerShippingFee: shippingFee,
            providerInsuranceValue: 0,
            shippingProvider: 'ghn',
            shippingService: 'standard',
            shipmentStatus: order.isDelivered ? 'delivered' : order.isPaid ? 'ready' : 'pending',
            idempotencyKey: `${SAMPLE_PREFIX}${order.key}`,
            currencyCode: currency.code,
            baseCurrencyCode: currency.code,
            baseItemsPrice: itemsPrice,
            baseDiscount: discount,
            baseTotalPrice: totalPrice,
            baseShippingFee: shippingFee,
            exchangeRateCapturedAt: createdAt,
            exchangeRates: [],
            isDeleted: false,
            createdAt,
          },
        },
        upsert: true,
      },
    };
  });

  await Order.bulkWrite(orderOperations);

  return {
    productsReused: new Set([...productsByKey.values()].map((product) => product._id.toString())).size,
  };
};

const rollbackSamples = async (customers) => {
  const customerEmails = customers.map((customer) => customer.email);
  const coupons = readJson('coupons.json');
  const sampleOrders = await Order.deleteMany({ idempotencyKey: { $regex: `^${SAMPLE_PREFIX}` } });
  const sampleProducts = await Product.deleteMany({ sourceProductId: { $regex: `^${SAMPLE_PREFIX}` } });
  const sampleCoupons = await Coupon.deleteMany({ code: { $in: coupons.map((coupon) => coupon.code) }, description: { $regex: '^\\[dashboard-sample\\]' } });
  const sampleCustomers = await Customer.find({ email: { $in: customerEmails } }).lean();
  const customerIds = sampleCustomers.map((customer) => customer._id);
  const referencedCustomerIds = await Order.distinct('customer', { customer: { $in: customerIds } });
  const removableCustomerIds = customerIds.filter((id) => !referencedCustomerIds.some((referencedId) => referencedId.equals(id)));
  const removedCustomers = removableCustomerIds.length
    ? await Customer.deleteMany({ _id: { $in: removableCustomerIds } })
    : { deletedCount: 0 };

  console.log(JSON.stringify({
    removed: {
      orders: sampleOrders.deletedCount,
      products: sampleProducts.deletedCount,
      coupons: sampleCoupons.deletedCount,
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
  const [productDefinitions, customers, orders, coupons] = ['products.json', 'customers.json', 'orders.json', 'coupons.json'].map(readJson);

  await connectMongo();
  const counts = await getExistingCounts();
  console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', rollback: options.rollback, existingDocuments: counts }, null, 2));

  if (options.emptyOnly && Object.values(counts).some((count) => count > 0)) {
    throw new Error('--empty-only chỉ cho phép khi cả products, customers, orders và coupons đều trống.');
  }

  if (!options.apply) {
    console.log(JSON.stringify({ planned: { productReferences: productDefinitions.length, customers: customers.length, orders: orders.length, coupons: coupons.length } }, null, 2));
    return;
  }

  if (options.rollback) {
    await rollbackSamples(customers);
    return;
  }

  const dependencies = await assertDependencies();
  const seeded = await upsertSamples({ productDefinitions, customers, orders, coupons, dependencies });
  console.log(JSON.stringify({ seeded: { ...seeded, customers: customers.length, orders: orders.length, coupons: coupons.length } }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
