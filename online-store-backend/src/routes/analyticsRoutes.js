/**
 * Routes cho analytics và dashboard
 * Toàn bộ endpoints là public (không yêu cầu authentication)
 */
const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getRevenueTimeline,
  getOrderStatusDistribution,
  getTopSellingProducts,
  getDashboardData,
} = require('../controllers/analyticsController');
const { clearCache } = require('../utils/cacheUtils');

/**
 * GET /api/analytics/dashboard-stats
 * Lấy KPI stats: tổng sản phẩm, tổng đơn hàng, doanh thu, khách hàng
 * Response: { totalProducts, inStockProducts, totalOrders, totalRevenue, totalCustomers }
 */
router.get('/dashboard-stats', getDashboardStats);

/**
 * GET /api/analytics/revenue-timeline?period=month&days=90
 * Lấy doanh thu theo timeline
 * Query params:
 *   - period: 'day' | 'month' | 'quarter' | 'year'
 *   - days: số ngày quay lại (mặc định 90)
 * Response: [{ period: string, revenue: number, count: number }, ...]
 */
router.get('/revenue-timeline', getRevenueTimeline);

/**
 * GET /api/analytics/order-status?days=30
 * Lấy phân bố trạng thái đơn hàng
 * Query params:
 *   - days: số ngày quay lại (mặc định 30)
 * Response: [{ name: string, value: number }, ...]
 */
router.get('/order-status', getOrderStatusDistribution);

/**
 * GET /api/analytics/top-products?limit=5&days=30
 * Lấy sản phẩm bán chạy nhất
 * Query params:
 *   - limit: số sản phẩm (mặc định 5)
 *   - days: số ngày quay lại (mặc định 30)
 * Response: [{ name: string, count: number, revenue: number, displayName: string }, ...]
 */
router.get('/top-products', getTopSellingProducts);

/**
 * GET /api/analytics/dashboard-data?days=30
 * Lấy tất cả dữ liệu dashboard một lần
 * Query params:
 *   - days: số ngày quay lại (mặc định 30)
 * Response: { stats, recentOrders, topProducts, orderStatus }
 */
router.get('/dashboard-data', getDashboardData);

/**
 * GET /api/analytics/clear-cache
 * Clear all analytics cache (for development/testing)
 * Clears cache for: dashboardStats, revenueTimeline, orderStatus, topProducts, dashboardData
 */
router.get('/clear-cache', (req, res) => {
  clearCache('dashboardStats');
  clearCache('revenueTimeline');
  clearCache('orderStatus');
  clearCache('topProducts');
  clearCache('dashboardData');
  res.json({ success: true, message: 'Analytics cache cleared' });
});

module.exports = router;
