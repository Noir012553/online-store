/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  getPublicSuppliers,
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  hardDeleteSupplier,
} = require('../controllers/supplierController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

/**
 * GET /api/suppliers/public/list - Lấy danh sách nhà cung cấp công khai (Public)
 */
router.get('/public/list', getPublicSuppliers);

/**
 * GET /api/suppliers - Lấy danh sách nhà cung cấp (Admin only, phân trang, tìm kiếm)
 * POST /api/suppliers - Tạo nhà cung cấp mới (Admin only)
 */
router.route('/')
  .get(protect, admin, getSuppliers)
  .post(protect, admin, createSupplier);

/**
 * GET /api/suppliers/:id - Lấy chi tiết nhà cung cấp (Admin only)
 * PUT /api/suppliers/:id - Cập nhật nhà cung cấp (Admin only)
 * DELETE /api/suppliers/:id - Xóa mềm nhà cung cấp (Admin only)
 */
router.route('/:id')
  .get(protect, admin, getSupplierById)
  .put(protect, admin, updateSupplier)
  .delete(protect, admin, deleteSupplier);

/**
 * DELETE /api/suppliers/:id/hard - Xóa cứng nhà cung cấp (Super Admin only)
 */
router.route('/:id/hard')
  .delete(protect, superAdmin, hardDeleteSupplier);

module.exports = router;
