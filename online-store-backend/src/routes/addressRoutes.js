/**
 * Routes quản lý địa chỉ giao hàng
 * Base: /api/addresses
 * 
 * Endpoints:
 * - GET  /api/addresses                     - Danh sách địa chỉ (user)
 * - GET  /api/addresses/:id                 - Chi tiết địa chỉ
 * - POST /api/addresses                     - Tạo địa chỉ
 * - PUT  /api/addresses/:id                 - Cập nhật địa chỉ
 * - PUT  /api/addresses/:id/default         - Đặt làm mặc định
 * - DELETE /api/addresses/:id               - Xóa mềm địa chỉ
 * - DELETE /api/addresses/:id/hard          - Xóa cứng (admin)
 * - GET  /api/addresses/deleted/list        - Danh sách xóa (admin)
 * - PUT  /api/addresses/:id/restore         - Khôi phục (admin)
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  setAsDefault,
  deleteAddress,
  hardDeleteAddress,
  getDeletedAddresses,
  restoreAddress,
} = require('../controllers/addressController');

// Public/User routes
router.get('/', protect, getAddresses);
router.get('/:id', protect, getAddressById);
router.post('/', protect, createAddress);
router.put('/:id', protect, updateAddress);
router.put('/:id/default', protect, setAsDefault);
router.delete('/:id', protect, deleteAddress);

// Admin routes
router.get('/deleted/list', protect, admin, getDeletedAddresses);
router.delete('/:id/hard', protect, admin, hardDeleteAddress);
router.put('/:id/restore', protect, admin, restoreAddress);

module.exports = router;
