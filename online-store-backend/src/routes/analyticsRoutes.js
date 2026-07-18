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
  getSlowSellingProducts,
  getUnpaidOrders,
  getInactiveCustomers,
  getLowInventoryProducts,
  getLowRatingProducts,
  getTopCustomers,
  getPaidOrders,
  getUnusedCoupons,
} = require('../controllers/analyticsController');
const { clearCache } = require('../utils/cacheUtils');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * GET /api/analytics/dashboard-stats
 * Lấy KPI stats: tổng sản phẩm, tổng đơn hàng, doanh thu, khách hàng
 * Response: { totalProducts, inStockProducts, totalOrders, totalRevenue, totalCustomers }
 */
router.get('/dashboard-stats', protect, admin, getDashboardStats);

/**
 * GET /api/analytics/revenue-timeline?period=month&days=90
 * Lấy doanh thu theo timeline
 * Query params:
 *   - period: 'day' | 'month' | 'quarter' | 'year'
 *   - days: số ngày quay lại (mặc định 90)
 * Response: [{ period: string, revenue: number, count: number }, ...]
 */
router.get('/revenue-timeline', protect, admin, getRevenueTimeline);

/**
 * GET /api/analytics/order-status?days=30
 * Lấy phân bố trạng thái đơn hàng
 * Query params:
 *   - days: số ngày quay lại (mặc định 30)
 * Response: [{ name: string, value: number }, ...]
 */
router.get('/order-status', protect, admin, getOrderStatusDistribution);

/**
 * GET /api/analytics/top-products?limit=5&days=30
 * Lấy sản phẩm bán chạy nhất
 * Query params:
 *   - limit: số sản phẩm (mặc định 5)
 *   - days: số ngày quay lại (mặc định 30)
 * Response: [{ name: string, count: number, revenue: number, displayName: string }, ...]
 */
router.get('/top-products', protect, admin, getTopSellingProducts);

/**
 * GET /api/analytics/dashboard-data?days=30
 * Lấy tất cả dữ liệu dashboard một lần
 * Query params:
 *   - days: số ngày quay lại (mặc định 30)
 * Response: { stats, recentOrders, topProducts, orderStatus }
 */
router.get('/dashboard-data', protect, admin, getDashboardData);

/**
 * GET /api/analytics/slow-selling-products?limit=10&days=30
 * Lấy sản phẩm bán chậm (low-performing products)
 * Dựa trên: số lượng order ít & tồn kho cao
 */
router.get('/slow-selling-products', protect, admin, getSlowSellingProducts);

/**
 * GET /api/analytics/unpaid-orders?limit=20&days=30
 * Lấy đơn hàng chưa thanh toán
 */
router.get('/unpaid-orders', protect, admin, getUnpaidOrders);

/**
 * GET /api/analytics/inactive-customers?limit=10&days=90
 * Lấy khách hàng không hoạt động
 * Dựa trên: không có order hoặc order cũ
 */
router.get('/inactive-customers', protect, admin, getInactiveCustomers);

/**
 * GET /api/analytics/low-inventory?limit=10&page=1&sort=countInStock&threshold=10
 * Lấy sản phẩm tồn kho thấp với phân trang
 */
router.get('/low-inventory', protect, admin, getLowInventoryProducts);

/**
 * GET /api/analytics/low-rating?limit=10&page=1&sort=rating&ratingThreshold=3.0&minReviews=1
 * Lấy sản phẩm có rating kém với phân trang
 */
router.get('/low-rating', protect, admin, getLowRatingProducts);

/**
 * GET /api/analytics/top-customers?limit=10&page=1&sort=-totalSpent&days=0
 * Lấy top customers theo tổng chi tiêu với phân trang
 */
router.get('/top-customers', protect, admin, getTopCustomers);

/**
 * GET /api/analytics/paid-orders?limit=20&page=1&sort=-createdAt&days=30
 * Lấy đơn hàng đã thanh toán với phân trang
 */
router.get('/paid-orders', protect, admin, getPaidOrders);

/**
 * GET /api/analytics/unused-coupons?limit=10&page=1&sort=currentUses&maxUsageRatio=0.5
 * Lấy mã giảm giá chưa được sử dụng hoặc ít sử dụng với phân trang
 */
router.get('/unused-coupons', protect, admin, getUnusedCoupons);

/**
 * GET /api/analytics/clear-cache
 * Clear all analytics cache (for development/testing)
 * Clears cache for: dashboardStats, revenueTimeline, orderStatus, topProducts, dashboardData
 */
router.get('/clear-cache', protect, admin, (req, res) => {
  clearCache('dashboardStats');
  clearCache('revenueTimeline');
  clearCache('orderStatus');
  clearCache('topProducts');
  clearCache('dashboardData');
  res.json({ success: true, message: 'Analytics cache cleared' });
});

module.exports = router;
