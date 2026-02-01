/**
 * Routes quản lý nhà vận chuyển (Shipping Provider Configuration)
 * Base: /api/shipping-providers
 * 
 * Endpoints (Admin only):
 * - GET    /api/shipping-providers                    - Danh sách
 * - POST   /api/shipping-providers                    - Tạo mới
 * - GET    /api/shipping-providers/:id                - Chi tiết
 * - PUT    /api/shipping-providers/:id                - Cập nhật
 * - PUT    /api/shipping-providers/:id/toggle         - Bật/tắt
 * - DELETE /api/shipping-providers/:id                - Xóa mềm
 * - GET    /api/shipping-providers/deleted/list       - Danh sách xóa
 * - PUT    /api/shipping-providers/:id/restore        - Khôi phục
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getShippingProviders,
  getShippingProviderById,
  createShippingProvider,
  updateShippingProvider,
  toggleProviderStatus,
  deleteShippingProvider,
  getDeletedProviders,
  restoreProvider,
  syncLocationData,
} = require('../controllers/shippingProviderController');

// All routes require admin access
router.use(protect, admin);

// Special routes (must be before /:id routes)
router.post('/admin/sync-locations', syncLocationData);
router.get('/deleted/list', getDeletedProviders);

// Main routes
router.get('/', getShippingProviders);
router.post('/', createShippingProvider);
router.get('/:id', getShippingProviderById);
router.put('/:id', updateShippingProvider);
router.put('/:id/toggle', toggleProviderStatus);
router.delete('/:id', deleteShippingProvider);
router.put('/:id/restore', restoreProvider);

module.exports = router;
