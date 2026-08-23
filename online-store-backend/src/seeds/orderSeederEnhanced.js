const Order = require('../models/Order');
const Product = require('../models/Product');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');
const { getActiveExchangeRates, getReportingCurrency } = require('../utils/orderRevenue');

const ORDER_SEED_PREFIX = 'demo-orders-v2';
const DEFAULT_ORDER_COUNT = 410;

const getProductNameAsString = (name) => {
  if (typeof name === 'string') return name;
  if (typeof name === 'object' && name !== null) {
    const available = Object.values(name).find(value => value && typeof value === 'string');
    if (available) return available;
  }

  const defaultLang = getDefaultLanguage().code.toUpperCase();
  return getMessage(defaultLang, 'common.unknownProduct');
};

const randomInt = (min, max) => {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const shuffle = (items) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const getRandomDateInMonth = (monthsAgo) => {
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();

  return new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    randomInt(1, lastDay),
    randomInt(0, 23),
    randomInt(0, 59),
    randomInt(0, 59),
  );
};

const getRecentDate = (daysAgo) => {
  const now = new Date();
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    randomInt(0, 23),
    randomInt(0, 59),
    randomInt(0, 59),
  );
};

const getOrderState = (createdAt, index) => {
  const ageInDays = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
  const stateIndex = index % 10;

  if (ageInDays > 30 || stateIndex >= 7) {
    return { isPaid: true, isDelivered: true, shipmentStatus: 'delivered' };
  }

  if (stateIndex < 2) {
    return { isPaid: false, isDelivered: false, shipmentStatus: 'pending' };
  }

  return { isPaid: true, isDelivered: false, shipmentStatus: stateIndex % 2 === 0 ? 'ready' : 'in_transit' };
};

const getOrderItems = (categoryGroups, orderIndex) => {
  const itemCount = categoryGroups.length === 1
    ? 1
    : orderIndex % 10 < 6
      ? 1
      : orderIndex % 10 < 9
        ? 2
        : 3;
  const items = [];

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const group = categoryGroups[(orderIndex + itemIndex) % categoryGroups.length];
    const product = group.products[group.nextProductIndex % group.products.length];
    group.nextProductIndex += 1;

    const price = Number(product.price);
    const originalPrice = Number(product.originalPrice);
    const maxQuantity = Math.max(1, Math.min(4, Number(product.countInStock) || 1));
    const quantity = randomInt(1, maxQuantity);
    const hasDiscount = Number.isFinite(originalPrice) && originalPrice > price;

    items.push({
      name: getProductNameAsString(product.name),
      qty: quantity,
      image: product.image || '/placeholder.png',
      price,
      ...(hasDiscount ? {
        originalPrice,
        discountPercentage: Math.round(((originalPrice - price) / originalPrice) * 100),
      } : {}),
      product: product._id,
    });
  }

  return items;
};

const createOrder = ({ customer, user, items, createdAt, currencyCode, exchangeRates, index }) => {
  const itemsPrice = items.reduce((total, item) => total + item.price * item.qty, 0);
  const taxPrice = Math.round(itemsPrice * 0.1);
  const shippingFee = itemsPrice >= 1000000 ? 0 : [30000, 45000, 60000][index % 3];
  const totalPrice = itemsPrice + taxPrice + shippingFee;
  const state = getOrderState(createdAt, index);
  const paidAt = state.isPaid ? new Date(Math.min(Date.now(), createdAt.getTime() + 6 * 60 * 60 * 1000)) : null;
  const deliveredAt = state.isDelivered ? new Date(Math.min(Date.now(), createdAt.getTime() + 5 * 24 * 60 * 60 * 1000)) : null;
  const paymentMethods = ['cod', 'card', 'bank_transfer', 'e_wallet', 'vnpay', 'momo'];
  const paymentMethod = state.isPaid ? paymentMethods[index % paymentMethods.length] : 'cod';

  return {
    customer: customer._id,
    user: user?._id || null,
    orderItems: items,
    itemsPrice,
    taxPrice,
    totalPrice,
    discount: 0,
    isPaid: state.isPaid,
    paidAt,
    paymentMethod,
    isDelivered: state.isDelivered,
    deliveredAt,
    shippingAddress: {
      name: customer.name,
      phone: customer.phone,
      address: `Địa chỉ demo ${index + 1}`,
    },
    shippingFee,
    shipmentStatus: state.shipmentStatus,
    shippingProvider: index % 3 === 0 ? 'ghn' : index % 3 === 1 ? 'ghtk' : 'viettel',
    shippingService: index % 4 === 0 ? 'express' : 'standard',
    idempotencyKey: `${ORDER_SEED_PREFIX}:${String(index).padStart(4, '0')}`,
    currencyCode,
    baseCurrencyCode: currencyCode,
    baseItemsPrice: itemsPrice,
    baseDiscount: 0,
    baseTotalPrice: totalPrice,
    baseShippingFee: shippingFee,
    exchangeRateCapturedAt: createdAt,
    exchangeRates,
    createdAt,
  };
};

const seedOrdersEnhanced = async (products, users, customers) => {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error('No customers provided. Orders cannot be created without customers');
  }

  const validCustomers = customers.filter(customer => customer?._id && customer.name && customer.email);
  if (validCustomers.length === 0) {
    throw new Error('No valid customers found');
  }

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('No products provided');
  }

  const productIds = products.map(product => product?._id).filter(Boolean);
  const activeProducts = await Product.find({
    _id: { $in: productIds },
    isDeleted: false,
    price: { $gt: 0 },
  })
    .populate({
      path: 'category',
      match: { isDeleted: false },
      select: '_id name key slug',
    })
    .lean();

  const productsByCategory = new Map();
  activeProducts.forEach(product => {
    if (!product.category?._id) return;
    const categoryId = String(product.category._id);
    if (!productsByCategory.has(categoryId)) productsByCategory.set(categoryId, []);
    productsByCategory.get(categoryId).push(product);
  });

  const categoryGroups = shuffle(
    [...productsByCategory.values()]
      .filter(categoryProducts => categoryProducts.length > 0)
      .map(categoryProducts => ({
        products: shuffle(categoryProducts),
        nextProductIndex: 0,
      }))
  );

  if (categoryGroups.length === 0) {
    throw new Error('No active products with valid categories found');
  }

  const [currencyCode, exchangeRates] = await Promise.all([
    getReportingCurrency(),
    getActiveExchangeRates(),
  ]);

  const orderCount = Math.max(1, Number(process.env.SEED_ORDER_COUNT) || DEFAULT_ORDER_COUNT);
  const recentOrdersCount = Math.min(80, orderCount);
  const historicalOrderCount = orderCount - recentOrdersCount;
  const orders = [];
  const validUsers = Array.isArray(users) ? users.filter(user => user?._id) : [];

  await Order.deleteMany({ idempotencyKey: { $regex: `^${ORDER_SEED_PREFIX}:` } });

  for (let index = 0; index < orderCount; index += 1) {
    const createdAt = index < recentOrdersCount
      ? getRecentDate(index % 2)
      : getRandomDateInMonth(2 + Math.floor(((index - recentOrdersCount) / Math.max(1, historicalOrderCount)) * 22));
    const customer = validCustomers[index % validCustomers.length];
    const user = validUsers.length > 0 ? validUsers[index % validUsers.length] : null;
    const items = getOrderItems(categoryGroups, index);

    orders.push(createOrder({
      customer,
      user,
      items,
      createdAt,
      currencyCode,
      exchangeRates,
      index,
    }));
  }

  const createdOrders = await Order.create(orders);
  const categoryDistribution = categoryGroups.map(group => group.products.length).join(', ');
  console.log(`Generated ${createdOrders.length} orders across ${categoryGroups.length} product categories (${categoryDistribution} products per category group)`);

  if (!createdOrders.some(order => order.customer)) {
    throw new Error('No orders have customer linkage');
  }

  return createdOrders;
};

module.exports = seedOrdersEnhanced;
