/**
 * Controller quản lý analytics và dashboard
 * Sử dụng MongoDB aggregation pipeline để tối ưu performance
 * Tính toán tất cả stats trong 1 lần query thay vì nhiều separate queries
 * Có caching để giảm tải database
 */
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Coupon = require('../models/Coupon');
const { withTimeout } = require('../utils/mongooseUtils');
const { withCache } = require('../utils/cacheUtils');
const { getDefaultLanguage, isSupportedLanguage, getIntlLocale, getActiveLangCodes } = require('../config/languageInventory');
const { getMessage } = require('../i18n/messages');
const { localizeProductCategories } = require('../services/categoryLocalizationService');
const {
  getCurrencyMetadata,
  formatAmountFields,
  formatProducts,
  formatOrders,
  formatCoupons,
} = require('../utils/currencyResponseFormatter');
const {
  convertOrderAmount,
  getActiveExchangeRates,
  getReportingCurrency,
  sumOrdersInCurrency,
} = require('../utils/orderRevenue');

/**
 * Lấy thống kê dashboard tối ưu (một lần fetch)
 * Sử dụng aggregation pipeline để tính tất cả metrics cùng lúc
 * Có caching 5 phút để giảm tải database
 * @route GET /api/analytics/dashboard-stats
 * @access Public
 * @returns {Object} { totalProducts, inStockProducts, totalOrders, totalRevenue, totalCustomers }
 */
const formatReportingAmountFields = async (data, reportingCurrency, lang, fields) => {
  const currencies = await getCurrencyMetadata([reportingCurrency]);
  return formatAmountFields(data, currencies.get(reportingCurrency), lang, fields);
};

const getDashboardStats = asyncHandler(async (req, res) => {
  const reportingCurrency = await getReportingCurrency(req.query.currency);
  const result = await withCache('dashboardStats', { reportingCurrency }, async () => {
    // Tính stats sản phẩm
    const productStats = await withTimeout(
      Product.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            inStockProducts: {
              $sum: { $cond: [{ $gt: ['$countInStock', 0] }, 1, 0] },
            },
          },
        },
      ]),
      8000
    );

    const [totalOrders, totalRevenue] = await Promise.all([
      Order.countDocuments({ isDeleted: false }),
      sumOrdersInCurrency({ isDeleted: false }, reportingCurrency),
    ]);

    // Đếm khách hàng từ Customer collection
    const totalCustomers = await withTimeout(
      Customer.countDocuments({}),
      5000
    );

    const productData = productStats[0] || {
      totalProducts: 0,
      inStockProducts: 0,
    };
    const orderData = {
      totalOrders,
      totalRevenue,
    };

    return {
      totalProducts: productData.totalProducts,
      inStockProducts: productData.inStockProducts,
      totalOrders: orderData.totalOrders,
      totalRevenue: orderData.totalRevenue,
      totalCustomers,
    };
  });

  res.json(await formatReportingAmountFields(result, reportingCurrency, req.lang, [
    ['totalRevenue', 'formattedTotalRevenue'],
  ]));
});

/**
 * Lấy doanh thu theo khoảng thời gian (ngày/tháng/quý/năm)
 * Có caching 10 phút
 * @route GET /api/analytics/revenue-timeline?period=month&startDate=2025-11-26&endDate=2025-12-26
 * @access Public
 * @query {String} period - 'day' | 'month' | 'quarter' | 'year'
 * @query {String} startDate - Ngày bắt đầu (ISO format: YYYY-MM-DD)
 * @query {String} endDate - Ngày kết thúc (ISO format: YYYY-MM-DD)
 * @query {Number} days - Số ngày quay lại (mặc định: 90) - chỉ dùng nếu không có startDate/endDate
 */
const getRevenueTimeline = asyncHandler(async (req, res) => {
  const period = req.query.period || 'month';
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const intlLocale = getIntlLocale(lang);
  const reportingCurrency = await getReportingCurrency(req.query.currency);
  let startDate, endDate;

  // Nếu có startDate và endDate, dùng chúng; nếu không thì dùng days
  if (req.query.startDate && req.query.endDate) {
    // Parse dates as local dates (not UTC)
    // Format: YYYY-MM-DD (received from frontend local date selection)
    const parseDateAsLocal = (dateString) => {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    startDate = parseDateAsLocal(req.query.startDate);
    endDate = parseDateAsLocal(req.query.endDate);
    // Đảm bảo endDate bao gồm cả ngày cuối cùng
    endDate.setHours(23, 59, 59, 999);
  } else {
    const days = parseInt(req.query.days) || 90;
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  // Create cache key with string dates to avoid Date object serialization issues
  const cacheKey = {
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    reportingCurrency,
  };

  const result = await withCache('revenueTimeline', cacheKey, async () => {

    const [orders, activeRates] = await Promise.all([
      Order.find({
        isDeleted: false,
        createdAt: { $gte: startDate, $lte: endDate },
      }, { createdAt: 1, totalPrice: 1, currencyCode: 1, exchangeRates: 1 }).lean(),
      getActiveExchangeRates(),
    ]);

    const groupedRevenue = new Map();
    for (const order of orders) {
      const date = new Date(order.createdAt);
      let key;
      if (period === 'day') {
        key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      } else if (period === 'month') {
        key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      } else if (period === 'quarter') {
        key = `${date.getFullYear()}-${Math.ceil((date.getMonth() + 1) / 3)}`;
      } else {
        key = `${date.getFullYear()}`;
      }

      const current = groupedRevenue.get(key) || { date, revenue: 0, count: 0 };
      current.revenue += convertOrderAmount(
        order.totalPrice,
        order.currencyCode,
        reportingCurrency,
        order.exchangeRates,
        activeRates
      );
      current.count += 1;
      groupedRevenue.set(key, current);
    }

    return Array.from(groupedRevenue.values()).sort((a, b) => a.date - b.date).map((item) => {
      let label = '';
      if (period === 'day') {
        label = item.date.toLocaleDateString(intlLocale);
      } else if (period === 'month') {
        label = new Intl.DateTimeFormat(intlLocale, {
          month: 'short',
          year: 'numeric',
        }).format(item.date);
      } else if (period === 'quarter') {
        label = `Q${Math.ceil((item.date.getMonth() + 1) / 3)}/${item.date.getFullYear()}`;
      } else if (period === 'year') {
        label = item.date.getFullYear().toString();
      }

      return {
        period: label,
        revenue: item.revenue,
        count: item.count,
      };
    });
  });

  const currencies = await getCurrencyMetadata([reportingCurrency]);
  const currency = currencies.get(reportingCurrency);
  res.json(result.map((item) => formatAmountFields(item, currency, lang, [
    ['revenue', 'formattedRevenue'],
  ])));
});

/**
 * Lấy trạng thái đơn hàng theo khoảng thời gian
 * Có caching 10 phút
 * @route GET /api/analytics/order-status?startDate=2025-11-26&endDate=2025-12-26
 * @access Public
 */
const getOrderStatusDistribution = asyncHandler(async (req, res) => {
  let startDate, endDate;

  if (req.query.startDate && req.query.endDate) {
    // Parse dates as local dates (not UTC)
    // Format: YYYY-MM-DD (received from frontend local date selection)
    const parseDateAsLocal = (dateString) => {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    startDate = parseDateAsLocal(req.query.startDate);
    endDate = parseDateAsLocal(req.query.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else {
    const days = parseInt(req.query.days) || 30;
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  // Create cache key with string dates to avoid Date object serialization issues
  const cacheKey = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  const result = await withCache('orderStatus', cacheKey, async () => {
    const statusKey1 = 'status_pending_payment';
    const statusKey2 = 'status_paid';
    const statusKey3 = 'status_delivered';

    const statusData = await withTimeout(
      Order.aggregate([
        {
          $match: {
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            [statusKey1]: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$isPaid', false] },
                      { $eq: ['$isDelivered', false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            [statusKey2]: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$isPaid', true] },
                      { $eq: ['$isDelivered', false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            [statusKey3]: {
              $sum: {
                $cond: [{ $eq: ['$isDelivered', true] }, 1, 0],
              },
            },
          },
        },
      ]),
      8000
    );

    const defaultLang = getDefaultLanguage().code;
    const lang1 = getMessage(defaultLang, 'admin-controllers-messages.order_status_pending_payment');
    const lang2 = getMessage(defaultLang, 'admin-controllers-messages.order_status_paid');
    const lang3 = getMessage(defaultLang, 'admin-controllers-messages.order_status_delivered');

    return statusData[0]
      ? [
          {
            name: lang1,
            value: statusData[0][statusKey1],
          },
          {
            name: lang2,
            value: statusData[0][statusKey2],
          },
          {
            name: lang3,
            value: statusData[0][statusKey3],
          },
        ]
      : [
          { name: lang1, value: 0 },
          { name: lang2, value: 0 },
          { name: lang3, value: 0 },
        ];
  });

  res.json(result);
});

/**
 * Lấy sản phẩm bán chạy nhất theo khoảng thời gian
 * Có caching 15 phút
 * @route GET /api/analytics/top-products?limit=5&lang=en&startDate=2025-11-26&endDate=2025-12-26
 * @access Public
 * @query {String} lang - 'vi' | 'en' (mặc định: 'vi')
 */
const getTopSellingProducts = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  let startDate, endDate;

  if (req.query.startDate && req.query.endDate) {
    // Parse dates as local dates (not UTC)
    // Format: YYYY-MM-DD (received from frontend local date selection)
    const parseDateAsLocal = (dateString) => {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    startDate = parseDateAsLocal(req.query.startDate);
    endDate = parseDateAsLocal(req.query.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else {
    const days = parseInt(req.query.days) || 30;
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    endDate = new Date();
  }

  const result = await getTopProductsQuery(limit, null, startDate, endDate, lang);
  res.json(await formatProducts(result, lang));
});

/**
 * Lấy tất cả dữ liệu dashboard chỉ bằng một endpoint
 * Phối hợp: stats + recent orders + top products
 * Có caching 5 phút
 * @route GET /api/analytics/dashboard-data?days=30&lang=vi
 * @access Public
 * @query {String} lang - 'vi' | 'en' (mặc định: 'vi')
 */
const getDashboardData = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const reportingCurrency = await getReportingCurrency(req.query.currency);
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  const result = await withCache('dashboardData', { days, lang, reportingCurrency }, async () => {
    // Parallel queries
    const [stats, recentOrders, topProducts, orderStatus] = await Promise.all([
      getDashboardStatsQuery(reportingCurrency),
      getRecentOrdersQuery(5, lang),
      getTopProductsQuery(5, days, null, null, lang),
      getOrderStatusQuery(days, null, null, lang),
    ]);

    return {
      stats,
      recentOrders,
      topProducts,
      orderStatus,
    };
  });

  const [stats, recentOrders, topProducts] = await Promise.all([
    formatReportingAmountFields(result.stats, reportingCurrency, lang, [
      ['totalRevenue', 'formattedTotalRevenue'],
    ]),
    formatOrders(result.recentOrders, lang),
    formatProducts(result.topProducts, lang),
  ]);

  res.json({
    ...result,
    stats,
    recentOrders,
    topProducts,
  });
});

/**
 * Helper: Get dashboard stats
 */
async function getDashboardStatsQuery(reportingCurrency) {
  const productStats = await Product.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        inStockProducts: {
          $sum: { $cond: [{ $gt: ['$countInStock', 0] }, 1, 0] },
        },
      },
    },
  ]);

  const [totalOrders, totalRevenue] = await Promise.all([
    Order.countDocuments({ isDeleted: false }),
    sumOrdersInCurrency({ isDeleted: false }, reportingCurrency),
  ]);

  const totalCustomers = await Customer.countDocuments({
    isDeleted: false,
  });

  const productData = productStats[0] || {
    totalProducts: 0,
    inStockProducts: 0,
  };
  const orderData = {
    totalOrders,
    totalRevenue,
  };

  return {
    totalProducts: productData.totalProducts,
    inStockProducts: productData.inStockProducts,
    totalOrders: orderData.totalOrders,
    totalRevenue: orderData.totalRevenue,
    totalCustomers,
  };
}

/**
 * Helper: Get recent orders
 */
async function getRecentOrdersQuery(limit = 5, lang = null) {
  const defaultLang = lang || getDefaultLanguage().code;
  const recentOrders = await Order.aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer',
        foreignField: '_id',
        as: 'customerInfo',
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        totalPrice: 1,
        currencyCode: 1,
        isPaid: 1,
        isDelivered: 1,
        createdAt: 1,
        customerName: {
          $cond: [
            { $gt: [{ $size: '$customerInfo' }, 0] },
            { $arrayElemAt: ['$customerInfo.name', 0] },
            {
              $cond: [
                { $gt: [{ $size: '$userInfo' }, 0] },
                { $arrayElemAt: ['$userInfo.username', 0] },
                null,
              ],
            },
          ],
        },
      },
    },
  ]);

  const unknownLabel = getMessage(defaultLang, 'common.unknownCustomer');
  return recentOrders.map(order => ({
    ...order,
    customerName: order.customerName || unknownLabel,
  }));
}

/**
 * Helper: Get top products
 */
async function getTopProductsQuery(limit = 5, days = 30, startDateParam = null, endDateParam = null, lang = null) {
  lang = lang || getDefaultLanguage().code;
  const defaultLang = getDefaultLanguage().code;
  let startDate, endDate;

  if (startDateParam && endDateParam) {
    startDate = new Date(startDateParam);
    endDate = new Date(endDateParam);
    // Đảm bảo endDate bao gồm cả ngày cuối cùng
    endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    endDate = new Date();
  }

  const topProducts = await Order.aggregate([
    {
      $match: {
        isDeleted: false,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$orderItems' },
    {
      $group: {
        _id: '$orderItems.product',
        productName: { $first: '$orderItems.name' },
        productImage: { $first: '$orderItems.image' },
        productPrice: { $first: '$orderItems.price' },
        totalQty: { $sum: '$orderItems.qty' },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'productInfo',
      },
    },
    {
      $project: {
        _id: 1,
        productName: { $ifNull: [{ $arrayElemAt: ['$productInfo.name', 0] }, '$productName'] },
        price: { $ifNull: [{ $arrayElemAt: ['$productInfo.price', 0] }, '$productPrice'] },
        image: { $ifNull: [{ $arrayElemAt: ['$productInfo.image', 0] }, '$productImage'] },
        rating: { $ifNull: [{ $arrayElemAt: ['$productInfo.rating', 0] }, 0] },
        numReviews: { $ifNull: [{ $arrayElemAt: ['$productInfo.numReviews', 0] }, 0] },
        baseCurrencyCode: { $arrayElemAt: ['$productInfo.baseCurrencyCode', 0] },
        count: '$totalQty',
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: limit,
    },
  ]);

  const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
  const productIds = topProducts.map(p => p._id.toString());

  // Get ALL translations for all products (for all languages, not just requested lang)
  const translations = await ProductCatalogTranslationCache.find({
    entityId: { $in: productIds },
    status: 'success',
  }).lean();

  // Build translation map: productId -> { lang: name, ... }
  const translationMap = {};
  translations.forEach(t => {
    if (!translationMap[t.entityId]) {
      translationMap[t.entityId] = {};
    }
    translationMap[t.entityId][t.targetLang] = t.name;
  });

  // Build multilingual name object for each product
  const processedProducts = topProducts.map(product => {
    const productTranslations = translationMap[product._id.toString()] || {};
    let nameValue = product.productName;

    // Build multilingual name object from:
    // 1. All translations from database
    // 2. Original product name (fallback for default language if not in translations)
    let nameObj = {
      [defaultLang]: nameValue, // Always default to original name for default language
      ...productTranslations, // Merge all translations, overriding if exists
    };

    // Ensure requested language is available (fallback chain)
    if (!nameObj[lang]) {
      // nameValue is a string, so fallback is simple: use vi for all languages until translations exist
      nameObj[lang] = nameValue;
    }

    return {
      _id: product._id,
      name: nameObj,
      price: product.price,
      baseCurrencyCode: product.baseCurrencyCode,
      image: product.image,
      rating: product.rating,
      numReviews: product.numReviews,
      count: product.count,
    };
  });

  return processedProducts;
}

/**
 * Helper: Get order status
 * @param days - Number of days to look back
 * @param startDateParam - Start date override
 * @param endDateParam - End date override
 * @param lang - Language for status names
 */
async function getOrderStatusQuery(days = 30, startDateParam = null, endDateParam = null, lang = null) {
  lang = lang || getDefaultLanguage().code;
  let startDate, endDate;

  if (startDateParam && endDateParam) {
    startDate = new Date(startDateParam);
    endDate = new Date(endDateParam);
    // Đảm bảo endDate bao gồm cả ngày cuối cùng
    endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    endDate = new Date();
  }

  const statusData = await Order.aggregate([
    {
      $match: {
        isDeleted: false,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        pending: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isPaid', false] },
                  { $eq: ['$isDelivered', false] },
                ],
              },
              1,
              0,
            ],
          },
        },
        paid: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isPaid', true] },
                  { $eq: ['$isDelivered', false] },
                ],
              },
              1,
              0,
            ],
          },
        },
        delivered: {
          $sum: {
            $cond: [{ $eq: ['$isDelivered', true] }, 1, 0],
          },
        },
      },
    },
  ]);

  // Map status names based on language (QUY TẮC #1: Static UI texts từ locales)
  const { getMessage } = require('../i18n/messages');
  const statusNames = {
    pending: getMessage(lang, 'orders.pending_payment'),
    paid: getMessage(lang, 'orders.paid_status'),
    delivered: getMessage(lang, 'orders.status_delivered'),
  };

  const data = statusData[0]
    ? [
        {
          name: statusNames.pending,
          value: statusData[0].pending,
        },
        {
          name: statusNames.paid,
          value: statusData[0].paid,
        },
        {
          name: statusNames.delivered,
          value: statusData[0].delivered,
        },
      ]
    : [
        { name: statusNames.pending, value: 0 },
        { name: statusNames.paid, value: 0 },
        { name: statusNames.delivered, value: 0 },
      ];

  return data;
}

/**
 * Lấy sản phẩm bán chậm (low-performing products)
 * Dựa trên: số lượng order và tồn kho cao
 * @route GET /api/analytics/slow-selling-products?limit=10&days=30
 * @access Private/Admin
 * @query {Number} limit - Số sản phẩm (mặc định: 10)
 * @query {Number} days - Số ngày quay lại (mặc định: 30)
 */
const getSlowSellingProducts = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const days = parseInt(req.query.days) || 30;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  // Tính khoảng thời gian
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Lấy sản phẩm có ít order và tồn kho nhiều
  const slowProducts = await withTimeout(
    Product.aggregate([
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: 'orders',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$product', '$$productId'] },
                isDeleted: false,
                createdAt: { $gte: startDate },
              },
            },
          ],
          as: 'orders',
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo',
        },
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          category: {
            $cond: [
              { $gt: [{ $size: '$categoryInfo' }, 0] },
              { $arrayElemAt: ['$categoryInfo', 0] },
              null,
            ],
          },
        },
      },
      {
        $match: {
          $or: [
            { orderCount: { $lte: 2 }, countInStock: { $gte: 5 } },
            { orderCount: 0 },
          ],
        },
      },
      {
        $sort: { orderCount: 1, countInStock: -1 },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          name: 1,
          brand: 1,
          price: 1,
          baseCurrencyCode: 1,
          countInStock: 1,
          image: 1,
          orderCount: 1,
          rating: 1,
          numReviews: 1,
          category: 1,
        },
      },
    ]),
    10000
  );

  // Process results to apply language-specific name and category (Rule #2: Dynamic Database Translations)
  let processedProducts = slowProducts;

  // Apply translations from ProductCatalogTranslationCache if lang is not default
  if (lang !== defaultLang) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    const productIds = slowProducts.map(p => p._id.toString());
    const translations = await ProductCatalogTranslationCache.find({
      entityId: { $in: productIds },
      entityType: { $ne: 'category' },
      targetLang: lang,
    }).lean();

    const translationMap = {};
    translations.forEach(t => {
      translationMap[t.entityId.toString()] = t;
    });

    processedProducts = slowProducts.map(product => {
      const translation = translationMap[product._id.toString()];
      let nameValue = product.name;

      // Build multilingual name object
      let nameObj = typeof nameValue === 'object' && nameValue !== null
        ? { ...nameValue }
        : { [defaultLang]: nameValue };

      if (translation && translation.name) {
        nameObj[lang] = translation.name;
      } else if (typeof nameValue === 'object' && nameValue !== null) {
        const fallbackChain = [lang, defaultLang];
        let fallbackValue = '';
        for (const fallbackLang of fallbackChain) {
          if (nameValue[fallbackLang]) {
            fallbackValue = nameValue[fallbackLang];
            break;
          }
        }
        nameObj[lang] = fallbackValue;
      }

      return {
        ...product,
        name: nameObj,
      };
    });
  } else {
    processedProducts = slowProducts.map(product => {
      let nameValue = product.name;

      // Build multilingual name object
      let nameObj = typeof nameValue === 'object' && nameValue !== null
        ? { ...nameValue }
        : { [defaultLang]: nameValue };

      return {
        ...product,
        name: nameObj,
      };
    });
  }

  res.json(await formatProducts(await localizeProductCategories(processedProducts, lang), lang));
});

/**
 * Lấy đơn hàng chưa thanh toán (unpaid orders)
 * @route GET /api/analytics/unpaid-orders?limit=20&days=30
 * @access Private/Admin
 * @query {Number} limit - Số đơn (mặc định: 20)
 * @query {Number} days - Số ngày quay lại (mặc định: 30)
 */
const getUnpaidOrders = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const days = parseInt(req.query.days) || 30;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const unpaidOrders = await withTimeout(
    Order.aggregate([
      {
        $match: {
          isDeleted: false,
          isPaid: false,
          createdAt: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $addFields: {
          customerName: {
            $cond: [
              { $gt: [{ $size: '$customerInfo' }, 0] },
              { $arrayElemAt: ['$customerInfo.name', 0] },
              { $cond: [
                { $gt: [{ $size: '$userInfo' }, 0] },
                { $arrayElemAt: ['$userInfo.name', 0] },
                'Unknown',
              ] },
            ],
          },
          daysOverdue: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              86400000,
            ],
          },
        },
      },
      {
        $sort: { daysOverdue: -1 },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          totalPrice: 1,
          currencyCode: 1,
          customerName: 1,
          paymentMethod: 1,
          createdAt: 1,
          isPaid: 1,
          isDelivered: 1,
          daysOverdue: 1,
          orderItems: 1,
        },
      },
    ]),
    10000
  );

  // Replace 'Unknown' with translated version
  const unknownLabel = getMessage(lang.toUpperCase(), 'common.unknown');
  unpaidOrders.forEach(order => {
    if (order.customerName === 'Unknown') {
      order.customerName = unknownLabel;
    }
  });

  const defaultLang2 = getDefaultLanguage().code;
  // Apply translations to orderItems if lang is not default (Rule #2: Dynamic Database Translations)
  if (lang !== defaultLang2) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    // Collect all product IDs from all orders
    const productIds = new Set();
    unpaidOrders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          if (item.product) {
            productIds.add(item.product.toString());
          }
        });
      }
    });

    // Fetch translations if there are product IDs
    let translationMap = {};
    if (productIds.size > 0) {
      const translations = await ProductCatalogTranslationCache.find({
        entityId: { $in: Array.from(productIds) },
        targetLang: lang
      }).lean();

      translations.forEach(t => {
        translationMap[t.entityId] = t;
      });
    }

    // Apply translations to orders
    for (let i = 0; i < unpaidOrders.length; i++) {
      const order = unpaidOrders[i];
      if (order.orderItems && Array.isArray(order.orderItems)) {
        unpaidOrders[i].orderItems = order.orderItems.map(item => {
          const translation = translationMap[item.product?.toString()];
          return {
            ...item,
            name: (translation && translation.name) ? translation.name : item.name
          };
        });
      }
    }
  }

  res.json(await formatOrders(unpaidOrders || [], lang));
});

/**
 * Lấy khách hàng không hoạt động (inactive customers)
 * Dựa trên: không có order hoặc order cũ
 * @route GET /api/analytics/inactive-customers?limit=10&days=90&lang=vi
 * @access Private/Admin
 * @query {Number} limit - Số khách (mặc định: 10)
 * @query {Number} days - Số ngày để xem xét inactive (mặc định: 90)
 * @query {String} lang - Ngôn ngữ (mặc định: vi) [Rule #2: Dynamic Database Translations]
 */
const getInactiveCustomers = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const days = parseInt(req.query.days) || 90;
  const reportingCurrency = await getReportingCurrency(req.query.currency);
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const inactiveCustomers = await withTimeout(
    Customer.aggregate([
      {
        $match: {
          isDeleted: false,
          role: 'user',
        },
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer',
          as: 'orders',
        },
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          lastOrderDate: {
            $max: '$orders.createdAt',
          },
        },
      },
      {
        $match: {
          $or: [
            { totalOrders: 0 },
            { lastOrderDate: { $lt: startDate } },
          ],
        },
      },
      {
        $addFields: {
          daysSinceLastOrder: {
            $cond: [
              { $ne: ['$lastOrderDate', null] },
              {
                $divide: [
                  { $subtract: [new Date(), '$lastOrderDate'] },
                  86400000,
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $sort: {
          daysSinceLastOrder: -1,
          createdAt: -1,
        },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          address: 1,
          totalOrders: 1,
          orders: 1,
          lastOrderDate: 1,
          daysSinceLastOrder: 1,
          createdAt: 1,
        },
      },
    ]),
    10000
  );

  const activeRates = await getActiveExchangeRates();
  const formattedCustomers = await Promise.all((inactiveCustomers || []).map(({ orders, ...customer }) => formatReportingAmountFields(
    {
      ...customer,
      totalSpent: orders.reduce(
        (total, order) => total + convertOrderAmount(
          order.totalPrice,
          order.currencyCode,
          reportingCurrency,
          order.exchangeRates,
          activeRates
        ),
        0
      ),
    },
    reportingCurrency,
    lang,
    [['totalSpent', 'formattedTotalSpent']]
  )));

  res.json(formattedCustomers);
});

/**
 * Lấy sản phẩm tồn kho thấp (low inventory products)
 * @route GET /api/analytics/low-inventory?limit=10&page=1&sort=-countInStock
 * @access Private/Admin
 * @query {Number} limit - Số sản phẩm mỗi trang (mặc định: 10)
 * @query {Number} page - Trang hiện tại (mặc định: 1)
 * @query {String} sort - Sắp xếp: countInStock, price, -countInStock, -price (mặc định: countInStock)
 */
const getLowInventoryProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const sortBy = req.query.sort || 'countInStock';
  const threshold = parseInt(req.query.threshold) || 10;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  // Build sort object
  let sortObj = {};
  if (sortBy.startsWith('-')) {
    sortObj[sortBy.substring(1)] = -1;
  } else {
    sortObj[sortBy] = 1;
  }
  if (!sortObj.countInStock) {
    sortObj.countInStock = 1; // Mặc định sắp xếp theo tồn kho
  }

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find({
      isDeleted: false,
      countInStock: { $lte: threshold, $gt: 0 },
    })
      .populate('category', 'name')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments({
      isDeleted: false,
      countInStock: { $lte: threshold, $gt: 0 },
    }),
  ]);

  // Process results to apply language-specific name and category (Rule #2: Dynamic Database Translations)
  let processedProducts = products || [];


  // Apply translations from ProductCatalogTranslationCache if lang is not 'vi'
  if (lang !== defaultLang) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    const productIds = (products || []).map(p => p._id.toString());
    const translations = await ProductCatalogTranslationCache.find({
      entityId: { $in: productIds },
      targetLang: lang
    }).lean();

    const translationMap = {};
    translations.forEach(t => {
      translationMap[t.entityId.toString()] = t;
    });

    processedProducts = (products || []).map(product => {
      const translation = translationMap[product._id.toString()];
      let nameValue = product.name;

      // Build multilingual name object
      let nameObj = typeof nameValue === 'object' && nameValue !== null
        ? { ...nameValue }
        : { [defaultLang]: nameValue };

      if (translation && translation.name) {
        nameObj[lang] = translation.name;
      } else if (typeof nameValue === 'object' && nameValue !== null) {
        const fallbackChain = [lang, defaultLang];
        let fallbackValue = '';
        for (const fallbackLang of fallbackChain) {
          if (nameValue[fallbackLang]) {
            fallbackValue = nameValue[fallbackLang];
            break;
          }
        }
        nameObj[lang] = fallbackValue;
      }

      return {
        ...product,
        name: nameObj,
      };
    });
  } else {
    processedProducts = (products || []).map(product => {
      let nameValue = product.name;

      // Build multilingual name object
      let nameObj = typeof nameValue === 'object' && nameValue !== null
        ? { ...nameValue }
        : { [defaultLang]: nameValue };

      return {
        ...product,
        name: nameObj,
      };
    });
  }

  res.json({
    data: await formatProducts(await localizeProductCategories(processedProducts, lang), lang),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Lấy sản phẩm có rating kém (low rating products)
 * @route GET /api/analytics/low-rating?limit=10&page=1&sort=rating
 * @access Private/Admin
 * @query {Number} limit - Số sản phẩm mỗi trang (mặc định: 10)
 * @query {Number} page - Trang hiện tại (mặc định: 1)
 * @query {String} sort - Sắp xếp: rating, numReviews, -rating, -numReviews (mặc định: rating)
 * @query {Number} ratingThreshold - Rating <= threshold (mặc định: 3.0)
 * @query {Number} minReviews - Sản phẩm phải có ít nhất bao nhiêu reviews (mặc định: 1)
 */
const getLowRatingProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const sortBy = req.query.sort || 'rating';
  const ratingThreshold = parseFloat(req.query.ratingThreshold) || 3.0;
  const minReviews = parseInt(req.query.minReviews) || 1;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  // Build sort object
  let sortObj = {};
  if (sortBy.startsWith('-')) {
    sortObj[sortBy.substring(1)] = -1;
  } else {
    sortObj[sortBy] = 1;
  }
  if (!sortObj.rating) {
    sortObj.rating = 1; // Mặc định sắp xếp theo rating
  }

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find({
      isDeleted: false,
      rating: { $lte: ratingThreshold, $gte: 0 },
      numReviews: { $gte: minReviews },
    })
      .populate('category', 'name')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments({
      isDeleted: false,
      rating: { $lte: ratingThreshold, $gte: 0 },
      numReviews: { $gte: minReviews },
    }),
  ]);

  // Process results to apply language-specific name and category (Rule #2: Dynamic Database Translations)
  let processedProducts = products || [];


  // Apply translations from ProductCatalogTranslationCache if lang is not 'vi'
  if (lang !== defaultLang) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    const productIds = (products || []).map(p => p._id.toString());
    const translations = await ProductCatalogTranslationCache.find({
      entityId: { $in: productIds },
      targetLang: lang
    }).lean();

    const translationMap = {};
    translations.forEach(t => {
      translationMap[t.entityId.toString()] = t;
    });

    processedProducts = (products || []).map(product => {
      const translation = translationMap[product._id.toString()];
      let nameValue = product.name;

      // Build multilingual name object
      let nameObj = typeof nameValue === 'object' && nameValue !== null
        ? { ...nameValue }
        : { [defaultLang]: nameValue };

      if (translation && translation.name) {
        nameObj[lang] = translation.name;
      } else if (typeof nameValue === 'object' && nameValue !== null) {
        const fallbackChain = [lang, defaultLang];
        let fallbackValue = '';
        for (const fallbackLang of fallbackChain) {
          if (nameValue[fallbackLang]) {
            fallbackValue = nameValue[fallbackLang];
            break;
          }
        }
        nameObj[lang] = fallbackValue;
      }

      return {
        ...product,
        name: nameObj,
      };
    });
  } else {
    processedProducts = (products || []).map(product => {
      let nameValue = product.name;

      // Build multilingual name object
      let nameObj = typeof nameValue === 'object' && nameValue !== null
        ? { ...nameValue }
        : { [defaultLang]: nameValue };

      return {
        ...product,
        name: nameObj,
      };
    });
  }

  res.json({
    data: await formatProducts(await localizeProductCategories(processedProducts, lang), lang),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Lấy top customers theo tổng chi tiêu (top customers by total spent)
 * @route GET /api/analytics/top-customers?limit=10&page=1&sort=-totalSpent
 * @access Private/Admin
 * @query {Number} limit - Số khách mỗi trang (mặc định: 10)
 * @query {Number} page - Trang hiện tại (mặc định: 1)
 * @query {String} sort - Sắp xếp: totalSpent, totalOrders, -totalSpent, -totalOrders (mặc định: -totalSpent)
 * @query {Number} days - Chỉ tính đơn hàng trong N ngày gần đây (mặc định: 0 = tất cả)
 */
const getTopCustomers = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const sortBy = req.query.sort || '-totalSpent';
  const days = parseInt(req.query.days) || 0;
  const reportingCurrency = await getReportingCurrency(req.query.currency);
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  // Build sort object
  let sortObj = {};
  if (sortBy.startsWith('-')) {
    sortObj[sortBy.substring(1)] = -1;
  } else {
    sortObj[sortBy] = 1;
  }
  if (!sortObj.totalSpent) {
    sortObj.totalSpent = -1;
  }

  const skip = (page - 1) * limit;

  // Tính startDate nếu có days
  const matchStage = { isDeleted: false, role: 'user' };
  if (days > 0) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    matchStage.createdAt = { $gte: startDate };
  }

  const customers = await withTimeout(
    Customer.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer',
          as: 'orders',
        },
      },
      {
        $addFields: {
          ordersList: {
            $filter: {
              input: '$orders',
              as: 'order',
              cond: { $eq: ['$$order.isDeleted', false] },
            },
          },
        },
      },
      {
        $addFields: {
          totalOrders: { $size: '$ordersList' },
        },
      },
      {
        $match: {
          totalOrders: { $gt: 0 },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          totalOrders: 1,
          ordersList: 1,
          createdAt: 1,
        },
      },
    ]),
    10000
  );

  const activeRates = await getActiveExchangeRates();
  const normalizedCustomers = customers
    .map((customer) => ({
      ...customer,
      totalSpent: customer.ordersList.reduce(
        (total, order) => total + convertOrderAmount(
          order.totalPrice,
          order.currencyCode,
          reportingCurrency,
          order.exchangeRates,
          activeRates
        ),
        0
      ),
    }))
    .sort((first, second) => {
      const direction = sortObj.totalSpent === 1 ? 1 : -1;
      return (first.totalSpent - second.totalSpent) * direction;
    });
  const totalCount = normalizedCustomers.length;
  const paginatedCustomers = normalizedCustomers.slice(skip, skip + limit).map(({ ordersList, ...customer }) => customer);

  res.json({
    data: (await Promise.all(paginatedCustomers.map((customer) => formatReportingAmountFields(
      customer,
      reportingCurrency,
      lang,
      [['totalSpent', 'formattedTotalSpent']]
    )))),
    pagination: {
      total: totalCount,
      page,
      limit,
      pages: Math.ceil(totalCount / limit),
    },
  });
});

/**
 * Lấy đơn hàng đã thanh toán (paid orders)
 * @route GET /api/analytics/paid-orders?limit=20&page=1&sort=-createdAt
 * @access Private/Admin
 * @query {Number} limit - Số đơn mỗi trang (mặc định: 20)
 * @query {Number} page - Trang hiện tại (mặc định: 1)
 * @query {String} sort - Sắp xếp: createdAt, totalPrice, -createdAt, -totalPrice (mặc định: -createdAt)
 * @query {Number} days - Chỉ lấy đơn hàng từ N ngày gần đây (mặc định: 30)
 */
const getPaidOrders = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const sortBy = req.query.sort || '-createdAt';
  const days = parseInt(req.query.days) || 30;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  // Build sort object
  let sortObj = {};
  if (sortBy.startsWith('-')) {
    sortObj[sortBy.substring(1)] = -1;
  } else {
    sortObj[sortBy] = 1;
  }
  if (!sortObj.createdAt) {
    sortObj.createdAt = -1;
  }

  const skip = (page - 1) * limit;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [orders, total] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          isDeleted: false,
          isPaid: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo',
        },
      },
      {
        $addFields: {
          customerName: {
            $cond: [
              { $gt: [{ $size: '$customerInfo' }, 0] },
              { $arrayElemAt: ['$customerInfo.name', 0] },
              'Unknown',
            ],
          },
        },
      },
      {
        $sort: sortObj,
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          totalPrice: 1,
          currencyCode: 1,
          customerName: 1,
          paymentMethod: 1,
          createdAt: 1,
          isPaid: 1,
          isDelivered: 1,
          orderItems: 1,
        },
      },
    ]),
    Order.countDocuments({
      isDeleted: false,
      isPaid: true,
      createdAt: { $gte: startDate },
    }),
  ]);

  // Replace 'Unknown' with translated version
  const unknownLabel = getMessage(lang.toUpperCase(), 'common.unknown');
  orders.forEach(order => {
    if (order.customerName === 'Unknown') {
      order.customerName = unknownLabel;
    }
  });

  res.json({
    data: await formatOrders(orders || [], lang),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Lấy mã giảm giá chưa được sử dụng hoặc ít sử dụng (unused/underutilized coupons)
 * @route GET /api/analytics/unused-coupons?limit=10&page=1&sort=currentUses&lang=vi
 * @access Private/Admin
 * @query {Number} limit - Số mã mỗi trang (mặc định: 10)
 * @query {Number} page - Trang hiện tại (mặc định: 1)
 * @query {String} sort - Sắp xếp: currentUses, maxUses, discountValue, -currentUses (mặc định: currentUses)
 * @query {Number} maxUsageRatio - Tỷ lệ sử dụng tối đa (mặc định: 0.5 = 50% tức mã dùng < 50% limit)
 * @query {String} lang - Ngôn ngữ (mặc định: vi) [Rule #2: Dynamic Database Translations]
 */
const getUnusedCoupons = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const sortBy = req.query.sort || 'currentUses';
  const maxUsageRatio = parseFloat(req.query.maxUsageRatio) || 0.5;
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  // Build sort object
  let sortObj = {};
  if (sortBy.startsWith('-')) {
    sortObj[sortBy.substring(1)] = -1;
  } else {
    sortObj[sortBy] = 1;
  }
  if (!sortObj.currentUses) {
    sortObj.currentUses = 1;
  }

  const skip = (page - 1) * limit;

  const [coupons, total] = await Promise.all([
    Coupon.find({
      isDeleted: false,
      isActive: true,
      endDate: { $gte: new Date() }, // Coupon chưa hết hạn
      $expr: {
        $lt: [
          '$currentUses',
          { $multiply: ['$maxUses', maxUsageRatio] }, // currentUses < (maxUses * ratio)
        ],
      },
    })
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean(),
    Coupon.countDocuments({
      isDeleted: false,
      isActive: true,
      endDate: { $gte: new Date() },
      $expr: {
        $lt: [
          '$currentUses',
          { $multiply: ['$maxUses', maxUsageRatio] },
        ],
      },
    }),
  ]);

  res.json({
    data: await formatCoupons(coupons || [], req.lang),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

module.exports = {
  getDashboardStats,
  getRevenueTimeline,
  getOrderStatusDistribution,
  getTopSellingProducts,
  getDashboardData,
  getSlowSellingProducts,
  getUnpaidOrders,
  getInactiveCustomers,
  getLowInventoryProducts,
  getLowRatingProducts,
  getTopCustomers,
  getPaidOrders,
  getUnusedCoupons,
};
