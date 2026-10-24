/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const {
  getCoupons,
  getCouponById,
  getCouponByCode,
  getDeletedCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  restoreCoupon,
  hardDeleteCoupon,
  calculateDiscount,
} = require('../controllers/couponController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/coupons - Lấy danh sách mã giảm giá (còn hạn, đang hoạt động, phân trang)
 */
router.get('/', getCoupons);

/**
 * GET /api/coupons/code/:code - Xác thực mã giảm giá theo code (Public)
 * Kiểm tra: còn hạn, đang hoạt động, chưa hết lượt sử dụng
 */
router.get('/code/:code', getCouponByCode);

/**
 * POST /api/coupons/calculate - Tính toán giá trị giảm giá cho đơn hàng (Public)
 * Kiểm tra điều kiện áp dụng, tính giá cuối cùng
 */
router.post('/calculate', calculateDiscount);

/**
 * GET /api/coupons/deleted/list - Lấy danh sách mã giảm giá đã xóa
 */
router.get('/deleted/list', protect, admin, getDeletedCoupons);

/**
 * GET /api/coupons/:id - Lấy chi tiết mã giảm giá
 */
router.get('/:id', getCouponById);

/**
 * POST /api/coupons - Tạo mã giảm giá mới (Admin only)
 */
router.post('/', protect, admin, createCoupon);

/**
 * PUT /api/coupons/:id - Cập nhật mã giảm giá (Admin only)
 */
router.put('/:id', protect, admin, updateCoupon);

/**
 * DELETE /api/coupons/:id - Xóa mềm mã giảm giá (Admin only)
 */
router.delete('/:id', protect, admin, deleteCoupon);

/**
 * PUT /api/coupons/:id/restore - Khôi phục mã giảm giá (Admin only)
 */
router.put('/:id/restore', protect, admin, restoreCoupon);

/**
 * DELETE /api/coupons/:id/hard - Xóa cứng mã giảm giá (Admin only)
 */
router.delete('/:id/hard', protect, admin, hardDeleteCoupon);

module.exports = router;
