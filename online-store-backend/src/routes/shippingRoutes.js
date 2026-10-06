/**
 * Routes quản lý vận chuyển
 * Base: /api/shipping
 * 
 * Endpoints:
 * - GET  /api/shipping/providers                    - Danh sách nhà vận chuyển
 * - POST /api/shipping/calculate                    - Tính phí vận chuyển (multi-carrier)
 * - GET  /api/shipping/locations/provinces          - Danh sách tỉnh/thành
 * - GET  /api/shipping/locations/districts?provinceId=X - Quận/huyện
 * - GET  /api/shipping/locations/wards?districtId=X      - Phường/xã
 */

const express = require('express');
const router = express.Router();
const {
  getProviders,
  calculateShipping,
  getProvinces,
  getDistricts,
  getWards,
} = require('../controllers/shippingController');

// Public routes
router.get('/providers', getProviders);
router.post('/calculate', calculateShipping);

// Location data routes
router.get('/locations/provinces', getProvinces);
router.get('/locations/districts', getDistricts);
router.get('/locations/wards', getWards);

module.exports = router;
