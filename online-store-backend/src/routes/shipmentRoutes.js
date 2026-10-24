/**
 * Routes quản lý vận đơn (shipments)
 * Base: /api/shipments
 * 
 * Endpoints:
 * - POST   /api/shipments                           - Tạo vận đơn
 * - GET    /api/shipments/:orderId                  - Chi tiết vận đơn
 * - GET    /api/shipments/:orderId/print-label      - Lấy link in nhãn
 * - DELETE /api/shipments/:orderId                  - Hủy vận đơn
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createShipment,
  getShipmentInfo,
  getPrintLabel,
  cancelShipment,
} = require('../controllers/shipmentController');

// All routes require user authentication
router.use(protect);

// Shipment management routes
router.post('/', createShipment);
router.get('/:orderId', getShipmentInfo);
router.get('/:orderId/print-label', getPrintLabel);
router.delete('/:orderId', cancelShipment);

module.exports = router;
