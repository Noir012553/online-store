/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  hardDeleteCategory,
} = require('../controllers/categoryController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

/**
 * GET /api/categories - Lấy danh sách danh mục (phân trang, tìm kiếm)
 * POST /api/categories - Tạo danh mục mới (Admin only)
 */
router.route('/')
  .get(getCategories)
  .post(protect, admin, createCategory);

/**
 * GET /api/categories/:id - Lấy chi tiết danh mục
 * PUT /api/categories/:id - Cập nhật danh mục (Admin only)
 * DELETE /api/categories/:id - Xóa mềm danh mục (Admin only)
 */
router.route('/:id')
  .get(getCategoryById)
  .put(protect, admin, updateCategory)
  .delete(protect, admin, deleteCategory);

/**
 * DELETE /api/categories/:id/hard - Xóa cứng danh mục (Super Admin only)
 */
router.route('/:id/hard')
  .delete(protect, superAdmin, hardDeleteCategory);

module.exports = router;
