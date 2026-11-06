/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const {
  addOrderItems,
  getOrderSummary,
  getOrderById,
  updateOrder,
  updateOrderToDelivered,
  updateOrderStatus,
  getMyOrders,
  getOrders,
  deleteOrder,
  restoreOrder,
  getDeletedOrders,
  hardDeleteOrder,
} = require('../controllers/orderController');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  handleValidationErrors,
  validateCreateOrder,
  validateOrderList,
  validateUpdateOrder,
  validateUpdateOrderStatus,
  validateCheckoutSummary,
} = require('../middleware/validationMiddleware');
const { createOrderLimiter } = require('../middleware/rateLimitMiddleware');

/**
 * POST /api/orders - Tạo đơn hàng mới (Người dùng đăng nhập)
 * Rate limited: 5 orders per hour per user
 * GET /api/orders - Lấy tất cả đơn hàng (Admin only - chứa PII như email, phone, address)
 */
/**
 * @openapi
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Lấy danh sách đơn hàng có tìm kiếm và lọc phía máy chủ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [all, pending, paid, delivered] }
 *       - in: query
 *         name: paymentMethod
 *         schema: { type: string, enum: [all, cod, card, bank_transfer, e_wallet, vnpay, momo] }
 *     responses:
 *       200:
 *         description: Trang đơn hàng phù hợp bộ lọc
 *       400:
 *         description: Tham số lọc không hợp lệ
 *         content:
 *           application/json:
 *             example:
 *               status: error
 *               code: VALIDATION_FAILED
 *               message: "Request validation failed"
 *               errors:
 *                 - field: status
 *                   message: "Invalid value"
 *       401:
 *         description: Thiếu hoặc token không hợp lệ
 *       403:
 *         description: Không có quyền quản trị
 */
router.route('/')
  .post(protect, createOrderLimiter, validateCreateOrder, handleValidationErrors, addOrderItems)
  .get(protect, admin, validateOrderList, handleValidationErrors, getOrders);

/**
 * POST /api/orders/summary - Tính lại giỏ hàng và checkout theo dữ liệu tin cậy
 * @access Private
 */
router.post('/summary', protect, validateCheckoutSummary, handleValidationErrors, getOrderSummary);

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
/**
 * @openapi
 * /api/orders/{id}:
 *   put:
 *     tags: [Orders]
 *     summary: Cập nhật thông tin giao nhận của đơn chưa thanh toán/chưa xử lý
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             shippingAddress:
 *               name: Nguyen Van A
 *               phone: "0901234567"
 *               address: "12 Le Loi, Quan 1"
 *     responses:
 *       200:
 *         description: Đơn hàng đã cập nhật
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Thiếu hoặc token không hợp lệ
 *       403:
 *         description: Không có quyền quản trị
 *       404:
 *         description: Không tìm thấy đơn hàng
 *       409:
 *         description: Không thể sửa sau khi thanh toán hoặc xử lý giao hàng bắt đầu
 */
router.route('/:id')
  .get(protect, getOrderById)
  .put(protect, admin, validateUpdateOrder, handleValidationErrors, updateOrder)
  .delete(protect, admin, deleteOrder);

/**
 * PUT /api/orders/:id/deliver - Cập nhật đơn hàng thành đã giao (Admin only)
 */
router.route('/:id/deliver')
  .put(protect, admin, updateOrderToDelivered);

/**
 * PUT /api/orders/:id/status - Cập nhật trạng thái đơn hàng (isPaid, isDelivered) (Admin only)
 */
router.route('/:id/status')
  .put(protect, admin, validateUpdateOrderStatus, handleValidationErrors, updateOrderStatus);

/**
 * PUT /api/orders/:id/restore - Khôi phục đơn hàng đã xóa (Admin only)
 */
router.route('/:id/restore')
  .put(protect, admin, restoreOrder);

/**
 * DELETE /api/orders/:id/hard - Xóa cứng đơn hàng (Admin only)
 */
router.route('/:id/hard')
  .delete(protect, admin, hardDeleteOrder);

module.exports = router;
