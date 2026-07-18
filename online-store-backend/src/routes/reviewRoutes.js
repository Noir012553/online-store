/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  getProductReviews,
  createProductReview,
  updateReview,
  deleteReview,
  hardDeleteReview,
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadLocal } = require('../middleware/uploadMiddleware');

/**
 * GET /api/reviews/products/:productId/reviews - Lấy danh sách đánh giá sản phẩm (phân trang)
 * POST /api/reviews/products/:productId/reviews - Tạo đánh giá mới (avatar lưu local)
 */
router.route('/products/:productId/reviews')
  .get(getProductReviews)
  .post(protect, uploadLocal.single('avatar'), createProductReview);

/**
 * PUT /api/reviews/:id - Cập nhật đánh giá (Người dùng đã tạo đánh giá này)
 * DELETE /api/reviews/:id - Xóa mềm đánh giá (Admin only)
 */
router.route('/:id')
  .put(protect, updateReview)
  .delete(protect, admin, deleteReview);

/**
 * DELETE /api/reviews/:id/hard - Xóa cứng đánh giá (Admin only)
 */
router.route('/:id/hard')
  .delete(protect, admin, hardDeleteReview);

module.exports = router;
