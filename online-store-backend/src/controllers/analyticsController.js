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

/**
 * Lấy thống kê dashboard tối ưu (một lần fetch)
 * Sử dụng aggregation pipeline để tính tất cả metrics cùng lúc
 * Có caching 5 phút để giảm tải database
 * @route GET /api/analytics/dashboard-stats
 * @access Public
 * @returns {Object} { totalProducts, inStockProducts, totalOrders, totalRevenue, totalCustomers }
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const result = await withCache('dashboardStats', {}, async () => {
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

    // Tính stats đơn hàng + doanh thu (trong một lần query)
    const orderStats = await withTimeout(
      Order.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
          },
        },
      ]),
      8000
    );

    // Đếm khách hàng từ Customer collection
    const totalCustomers = await withTimeout(
      Customer.countDocuments({}),
      5000
    );

    const productData = productStats[0] || {
      totalProducts: 0,
      inStockProducts: 0,
    };
    const orderData = orderStats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
    };

    return {
      totalProducts: productData.totalProducts,
      inStockProducts: productData.inStockProducts,
      totalOrders: orderData.totalOrders,
      totalRevenue: orderData.totalRevenue,
      totalCustomers,
    };
  });

  res.json(result);
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
  };

  const result = await withCache('revenueTimeline', cacheKey, async () => {

    let groupByField = {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
    };

    switch (period) {
      case 'day':
        groupByField = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        };
        break;
      case 'quarter':
        groupByField = {
          year: { $year: '$createdAt' },
          quarter: {
            $ceil: { $divide: [{ $month: '$createdAt' }, 3] },
          },
        };
        break;
      case 'year':
        groupByField = {
          year: { $year: '$createdAt' },
        };
        break;
    }

    const revenueData = await withTimeout(
      Order.aggregate([
        {
          $match: {
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: groupByField,
            revenue: { $sum: '$totalPrice' },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.quarter': 1 },
        },
      ]),
      8000
    );

    // Format output
    return revenueData.map((item) => {
      let label = '';
      if (period === 'day') {
        const date = new Date(item._id.year, item._id.month - 1, item._id.day);
        label = date.toLocaleDateString('vi-VN');
      } else if (period === 'month') {
        label = `T${item._id.month}/${item._id.year}`;
      } else if (period === 'quarter') {
        label = `Q${item._id.quarter}/${item._id.year}`;
      } else if (period === 'year') {
        label = item._id.year.toString();
      }

      return {
        period: label,
        revenue: Math.round(item.revenue),
        count: item.count,
      };
    });
  });

  res.json(result);
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
            'Chờ thanh toán': {
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
            'Đã thanh toán': {
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
            'Đã giao': {
              $sum: {
                $cond: [{ $eq: ['$isDelivered', true] }, 1, 0],
              },
            },
          },
        },
      ]),
      8000
    );

    return statusData[0]
      ? [
          {
            name: 'Chờ thanh toán',
            value: statusData[0]['Chờ thanh toán'],
          },
          {
            name: 'Đã thanh toán',
            value: statusData[0]['Đã thanh toán'],
          },
          {
            name: 'Đã giao',
            value: statusData[0]['Đã giao'],
          },
        ]
      : [
          { name: 'Chờ thanh toán', value: 0 },
          { name: 'Đã thanh toán', value: 0 },
          { name: 'Đã giao', value: 0 },
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
    limit,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  const result = await withCache('topProducts', cacheKey, async () => {
    const data = await withTimeout(
      Order.aggregate([
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
            fallbackName: { $first: '$orderItems.name' },
            totalQty: { $sum: '$orderItems.qty' },
            totalRevenue: {
              $sum: {
                $multiply: ['$orderItems.price', '$orderItems.qty'],
              },
            },
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
            productName: { $ifNull: [{ $arrayElemAt: ['$productInfo.name', 0] }, '$fallbackName'] },
            totalQty: 1,
            totalRevenue: 1,
          },
        },
        {
          $sort: { totalQty: -1 },
        },
        {
          $limit: limit,
        },
      ]),
      8000
    );

    return data.map(item => {
      let nameValue = item.productName || '';

      if (typeof nameValue !== 'string') {
        nameValue = String(nameValue);
      }

      const displayName = nameValue.length > 30
        ? nameValue.substring(0, 27) + '...'
        : nameValue;

      return {
        name: nameValue,
        count: item.totalQty,
        revenue: Math.round(item.totalRevenue),
        displayName,
      };
    });
  });

  res.json(result);
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
  const lang = req.query.lang || 'vi';

  const result = await withCache('dashboardData', { days, lang }, async () => {
    // Parallel queries
    const [stats, recentOrders, topProducts, orderStatus] = await Promise.all([
      getDashboardStatsQuery(),
      getRecentOrdersQuery(5),
      getTopProductsQuery(5, days, null, null, lang),
      getOrderStatusQuery(days),
    ]);

    return {
      stats,
      recentOrders,
      topProducts,
      orderStatus,
    };
  });

  res.json(result);
});

/**
 * Helper: Get dashboard stats
 */
async function getDashboardStatsQuery() {
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

  const orderStats = await Order.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totalPrice' },
      },
    },
  ]);

  const totalCustomers = await Customer.countDocuments({
    isDeleted: false,
  });

  const productData = productStats[0] || {
    totalProducts: 0,
    inStockProducts: 0,
  };
  const orderData = orderStats[0] || {
    totalOrders: 0,
    totalRevenue: 0,
  };

  return {
    totalProducts: productData.totalProducts,
    inStockProducts: productData.inStockProducts,
    totalOrders: orderData.totalOrders,
    totalRevenue: Math.round(orderData.totalRevenue),
    totalCustomers,
  };
}

/**
 * Helper: Get recent orders
 */
async function getRecentOrdersQuery(limit = 5) {
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
                'Unknown',
              ],
            },
          ],
        },
      },
    },
  ]);

  return recentOrders;
}

/**
 * Helper: Get top products
 */
async function getTopProductsQuery(limit = 5, days = 30, startDateParam = null, endDateParam = null, lang = 'vi') {
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
        // Use product name from products collection (more up-to-date and localized)
        // Fallback to orderItems name if product lookup fails
        productName: { $ifNull: [{ $arrayElemAt: ['$productInfo.name', 0] }, '$productName'] },
        price: { $ifNull: [{ $arrayElemAt: ['$productInfo.price', 0] }, '$productPrice'] },
        image: { $ifNull: [{ $arrayElemAt: ['$productInfo.image', 0] }, '$productImage'] },
        rating: { $ifNull: [{ $arrayElemAt: ['$productInfo.rating', 0] }, 0] },
        numReviews: { $ifNull: [{ $arrayElemAt: ['$productInfo.numReviews', 0] }, 0] },
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

  // Process results
  return topProducts.map(product => {
    let nameValue = product.productName;

    // Handle object name format for language-specific translation
    if (typeof nameValue === 'object' && nameValue !== null) {
      nameValue = nameValue[lang] || nameValue.vi || nameValue.en || '';
    }

    const displayName = nameValue.length > 30
      ? nameValue.substring(0, 27) + '...'
      : nameValue;

    return {
      _id: product._id,
      name: nameValue,
      price: product.price,
      image: product.image,
      rating: product.rating,
      numReviews: product.numReviews,
      count: product.count,
      displayName,
    };
  });
}

/**
 * Helper: Get order status
 */
async function getOrderStatusQuery(days = 30, startDateParam = null, endDateParam = null) {
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

  const data = statusData[0]
    ? [
        {
          name: 'Chờ thanh toán',
          value: statusData[0].pending,
        },
        {
          name: 'Đã thanh toán',
          value: statusData[0].paid,
        },
        {
          name: 'Đã giao',
          value: statusData[0].delivered,
        },
      ]
    : [
        { name: 'Chờ thanh toán', value: 0 },
        { name: 'Đã thanh toán', value: 0 },
        { name: 'Đã giao', value: 0 },
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
        $addFields: {
          orderCount: { $size: '$orders' },
          categoryName: {
            $cond: [
              { $isArray: ['$category'] },
              { $arrayElemAt: ['$category', 0] },
              '$category',
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

  res.json(slowProducts || []);
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

  res.json(unpaidOrders || []);
});

/**
 * Lấy khách hàng không hoạt động (inactive customers)
 * Dựa trên: không có order hoặc order cũ
 * @route GET /api/analytics/inactive-customers?limit=10&days=90
 * @access Private/Admin
 * @query {Number} limit - Số khách (mặc định: 10)
 * @query {Number} days - Số ngày để xem xét inactive (mặc định: 90)
 */
const getInactiveCustomers = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const days = parseInt(req.query.days) || 90;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const inactiveCustomers = await withTimeout(
    Customer.aggregate([
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
          totalSpent: 1,
          lastOrderDate: 1,
          daysSinceLastOrder: 1,
          createdAt: 1,
        },
      },
    ]),
    10000
  );

  res.json(inactiveCustomers || []);
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
  const threshold = parseInt(req.query.threshold) || 10; // Tồn kho <= 10 là thấp

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
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments({
      isDeleted: false,
      countInStock: { $lte: threshold, $gt: 0 },
    }),
  ]);

  res.json({
    data: products || [],
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

  res.json({
    data: products || [],
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
  const matchStage = { isDeleted: false };
  if (days > 0) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    matchStage.createdAt = { $gte: startDate };
  }

  const customers = await withTimeout(
    Customer.aggregate([
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
          totalSpent: {
            $sum: {
              $map: {
                input: '$ordersList',
                as: 'order',
                in: { $cond: [{ $eq: ['$$order.totalPrice', null] }, 0, '$$order.totalPrice'] },
              },
            },
          },
        },
      },
      {
        $match: {
          totalOrders: { $gt: 0 },
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
          name: 1,
          email: 1,
          phone: 1,
          totalOrders: 1,
          totalSpent: 1,
          createdAt: 1,
        },
      },
    ]),
    10000
  );

  const totalCount = await withTimeout(
    Customer.countDocuments({}),
    5000
  );

  res.json({
    data: customers || [],
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

  res.json({
    data: orders || [],
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
 * @route GET /api/analytics/unused-coupons?limit=10&page=1&sort=currentUses
 * @access Private/Admin
 * @query {Number} limit - Số mã mỗi trang (mặc định: 10)
 * @query {Number} page - Trang hiện tại (mặc định: 1)
 * @query {String} sort - Sắp xếp: currentUses, maxUses, discountValue, -currentUses (mặc định: currentUses)
 * @query {Number} maxUsageRatio - Tỷ lệ sử dụng tối đa (mặc định: 0.5 = 50% tức mã dùng < 50% limit)
 */
const getUnusedCoupons = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const sortBy = req.query.sort || 'currentUses';
  const maxUsageRatio = parseFloat(req.query.maxUsageRatio) || 0.5;

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
    data: coupons || [],
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
