/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const {
  getProvinces,
  getDistrictsByProvince,
  getWardsByDistrict,
  searchProvinces,
} = require('../controllers/locationController');

const router = express.Router();

/**
 * GET /api/locations/provinces - Lấy tất cả tỉnh/thành phố Việt Nam
 */
router.get('/provinces', getProvinces);

/**
 * GET /api/locations/districts/:provinceCode - Lấy quận/huyện theo tỉnh
 */
router.get('/districts/:provinceCode', getDistrictsByProvince);

/**
 * GET /api/locations/wards/:districtCode - Lấy phường/xã theo quận
 */
router.get('/wards/:districtCode', getWardsByDistrict);

/**
 * GET /api/locations/search/provinces?q=query - Tìm kiếm tỉnh theo từ khóa
 */
router.get('/search/provinces', searchProvinces);

module.exports = router;
