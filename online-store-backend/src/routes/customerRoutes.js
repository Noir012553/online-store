/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  getDeletedCustomers,
  hardDeleteCustomer,
  getCustomerByPhone,
  createOrUpdateCustomerByPhone,
} = require('../controllers/customerController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

/**
 * GET /api/customers - Lấy danh sách khách hàng (Admin only, phân trang, tìm kiếm)
 * POST /api/customers - Tạo khách hàng mới (Admin only)
 */
router.route('/')
  .get(protect, admin, getCustomers)
  .post(protect, admin, createCustomer);

/**
 * GET /api/customers/deleted/list - Lấy danh sách khách hàng đã xóa (Admin only)
 */
router.route('/deleted/list')
  .get(protect, admin, getDeletedCustomers);

/**
 * GET /api/customers/:id - Lấy chi tiết khách hàng (Admin only)
 * PUT /api/customers/:id - Cập nhật khách hàng (Admin only)
 * DELETE /api/customers/:id - Xóa mềm khách hàng (Admin only)
 */
router.route('/:id')
  .get(protect, admin, getCustomerById)
  .put(protect, admin, updateCustomer)
  .delete(protect, admin, deleteCustomer);

/**
 * PUT /api/customers/:id/restore - Khôi phục khách hàng đã xóa (Admin only)
 */
router.route('/:id/restore')
  .put(protect, admin, restoreCustomer);

/**
 * DELETE /api/customers/:id/hard - Xóa cứng khách hàng (Super Admin only)
 */
router.route('/:id/hard')
  .delete(protect, superAdmin, hardDeleteCustomer);

/**
 * GET /api/customers/phone/:phone - Lấy khách hàng theo số điện thoại (Admin only)
 * POST /api/customers/phone/:phone - Tạo/cập nhật khách hàng theo phone (Admin only, upsert)
 */
router.route('/phone/:phone')
  .get(protect, admin, getCustomerByPhone)
  .post(protect, admin, createOrUpdateCustomerByPhone);

module.exports = router;
