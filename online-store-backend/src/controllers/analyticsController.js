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
 * @route GET /api/analytics/top-products?limit=5&startDate=2025-11-26&endDate=2025-12-26
 * @access Public
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
    return await withTimeout(
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
            _id: {
              productId: '$orderItems.product',
              name: '$orderItems.name',
            },
            totalQty: { $sum: '$orderItems.qty' },
            totalRevenue: {
              $sum: {
                $multiply: ['$orderItems.price', '$orderItems.qty'],
              },
            },
          },
        },
        {
          $sort: { totalQty: -1 },
        },
        {
          $limit: limit,
        },
        {
          $project: {
            name: '$_id.name',
            count: '$totalQty',
            revenue: { $round: ['$totalRevenue', 0] },
            displayName: {
              $cond: [
                { $lte: [{ $strLenCP: '$_id.name' }, 30] },
                '$_id.name',
                {
                  $concat: [
                    { $substr: ['$_id.name', 0, 27] },
                    '...',
                  ],
                },
              ],
            },
            _id: 0,
          },
        },
      ]),
      8000
    );
  });

  res.json(result);
});

/**
 * Lấy tất cả dữ liệu dashboard chỉ bằng một endpoint
 * Phối hợp: stats + recent orders + top products
 * Có caching 5 phút
 * @route GET /api/analytics/dashboard-data?days=30
 * @access Public
 */
const getDashboardData = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;

  const result = await withCache('dashboardData', { days }, async () => {
    // Parallel queries
    const [stats, recentOrders, topProducts, orderStatus] = await Promise.all([
      getDashboardStatsQuery(),
      getRecentOrdersQuery(5),
      getTopProductsQuery(5, days),
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
async function getTopProductsQuery(limit = 5, days = 30, startDateParam = null, endDateParam = null) {
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
        name: '$productName',
        price: { $ifNull: [{ $arrayElemAt: ['$productInfo.price', 0] }, '$productPrice'] },
        image: { $ifNull: [{ $arrayElemAt: ['$productInfo.image', 0] }, '$productImage'] },
        rating: { $ifNull: [{ $arrayElemAt: ['$productInfo.rating', 0] }, 0] },
        numReviews: { $ifNull: [{ $arrayElemAt: ['$productInfo.numReviews', 0] }, 0] },
        count: '$totalQty',
        displayName: {
          $cond: [
            { $lte: [{ $strLenCP: '$productName' }, 30] },
            '$productName',
            {
              $concat: [
                { $substr: ['$productName', 0, 27] },
                '...',
              ],
            },
          ],
        },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: limit,
    },
  ]);

  return topProducts;
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

module.exports = {
  getDashboardStats,
  getRevenueTimeline,
  getOrderStatusDistribution,
  getTopSellingProducts,
  getDashboardData,
};
