/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getDeletedProducts,
  hardDeleteProduct,
  getTopRatedProducts,
  getStatsOverview,
  getTestimonials,
} = require('../controllers/productController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

/**
 * GET /api/products/stats/overview - Lấy thống kê chung cửa hàng
 */
router.get('/stats/overview', getStatsOverview);

/**
 * GET /api/products/testimonials/featured - Lấy testimonials từ reviews
 */
router.get('/testimonials/featured', getTestimonials);

/**
 * GET /api/products/top/rated - Lấy sản phẩm được đánh giá cao nhất
 */
router.get('/top/rated', getTopRatedProducts);

/**
 * GET /api/products/featured - Lấy sản phẩm tối ưu (không populate reviews)
 * Dùng cho home page để tránh timeout khi fetch nhiều products
 */
router.get('/featured/list', getFeaturedProducts);

/**
 * GET /api/products - Lấy danh sách sản phẩm (phân trang, tìm kiếm, lọc)
 * POST /api/products - Tạo sản phẩm mới (Admin only, upload ảnh bắt buộc)
 */
router.route('/')
  .get(getProducts)
  .post(protect, admin, upload.single('image'), createProduct);

/**
 * GET /api/products/deleted/list - Lấy danh sách sản phẩm đã xóa (Admin only)
 */
router.get('/deleted/list', protect, admin, getDeletedProducts);

/**
 * GET /api/products/:id - Lấy chi tiết sản phẩm
 * PUT /api/products/:id - Cập nhật sản phẩm (Admin only)
 * DELETE /api/products/:id - Xóa mềm sản phẩm (Admin only)
 */
router.route('/:id')
  .get(getProductById)
  .put(protect, admin, upload.single('image'), updateProduct)
  .delete(protect, admin, deleteProduct);

/**
 * PUT /api/products/:id/restore - Khôi phục sản phẩm đã xóa (Admin only)
 */
router.put('/:id/restore', protect, admin, restoreProduct);

/**
 * DELETE /api/products/:id/hard - Xóa cứng sản phẩm (Super Admin only)
 */
router.delete('/:id/hard', protect, superAdmin, hardDeleteProduct);

module.exports = router;
