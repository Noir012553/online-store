const express = require('express');
const router = express.Router();
const {
  getShippingMethods,
  calculateShippingFee,
  getGHNProvinces,
  getGHNDistricts,
  getGHNWards
} = require('../controllers/shippingController');

/**
 * GHN Real API Endpoints (must be before generic routes)
 */

/**
 * POST /api/shipping/calculate-fee
 * Calculate real shipping fee from GHN
 */
router.post('/calculate-fee', calculateShippingFee);

/**
 * GET /api/shipping/ghn/provinces
 * Get GHN provinces
 */
router.get('/ghn/provinces', getGHNProvinces);

/**
 * GET /api/shipping/ghn/districts/:provinceId
 * Get GHN districts by province
 */
router.get('/ghn/districts/:provinceId', getGHNDistricts);

/**
 * GET /api/shipping/ghn/wards/:districtId
 * Get GHN wards by district
 */
router.get('/ghn/wards/:districtId', getGHNWards);

/**
 * GET /api/shipping
 * Get all available shipping methods with carrier info
 */
router.get('/', getShippingMethods);

module.exports = router;
