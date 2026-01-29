/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  addOrderItems,
  getOrderById,
  updateOrderToDelivered,
  getMyOrders,
  getOrders,
  deleteOrder,
  restoreOrder,
  getDeletedOrders,
  hardDeleteOrder,
} = require('../controllers/orderController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');
const {
  handleValidationErrors,
  validateCreateOrder,
} = require('../middleware/validationMiddleware');

/**
 * POST /api/orders - Tạo đơn hàng mới (Người dùng đăng nhập)
 * GET /api/orders - Lấy tất cả đơn hàng (Admin only - chứa PII như email, phone, address)
 */
router.route('/')
  .post(protect, validateCreateOrder, handleValidationErrors, addOrderItems)
  .get(protect, admin, getOrders);

/**
 * GET /api/orders/deleted/list - Lấy danh sách đơn hàng đã xóa (Admin only)
 */
router.route('/deleted/list')
  .get(protect, admin, getDeletedOrders);

/**
 * GET /api/orders/myorders - Lấy danh sách đơn hàng của người dùng hiện tại (phân trang)
 */
router.route('/myorders')
  .get(protect, getMyOrders);

/**
 * GET /api/orders/:id - Lấy chi tiết đơn hàng theo ID
 * DELETE /api/orders/:id - Xóa mềm đơn hàng (Admin only)
 *
 * Note: GET endpoint is public (for payment confirmation page)
 * DELETE endpoint requires admin auth
 */
router.route('/:id')
  .get(getOrderById)
  .delete(protect, admin, deleteOrder);

/**
 * PUT /api/orders/:id/deliver - Cập nhật đơn hàng thành đã giao (Admin only)
 */
router.route('/:id/deliver')
  .put(protect, admin, updateOrderToDelivered);

/**
 * PUT /api/orders/:id/restore - Khôi phục đơn hàng đã xóa (Admin only)
 */
router.route('/:id/restore')
  .put(protect, admin, restoreOrder);

/**
 * DELETE /api/orders/:id/hard - Xóa cứng đơn hàng (Super Admin only)
 */
router.route('/:id/hard')
  .delete(protect, superAdmin, hardDeleteOrder);

module.exports = router;
