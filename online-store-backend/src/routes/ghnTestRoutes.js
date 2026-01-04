const express = require('express');
const router = express.Router();
const ghnService = require('../services/ghnService');
const asyncHandler = require('express-async-handler');

/**
 * @route GET /api/test/ghn/config
 * @access Public (chỉ để development/test)
 * @description Kiểm tra cấu hình GHN
 */
router.get('/config', asyncHandler(async (req, res) => {
  const haToken = !!process.env.GHN_TOKEN;
  const hasShopId = !!process.env.GHN_SHOP_ID;
  const ghnApiUrl = process.env.GHN_API_URL || 'https://dev-online-gateway.ghn.vn/shiip/public-api';

  res.json({
    configured: haToken && hasShopId,
    ghnApiUrl,
    token: haToken ? `${process.env.GHN_TOKEN.substring(0, 10)}...` : 'NOT SET',
    shopId: process.env.GHN_SHOP_ID || 'NOT SET'
  });
}));

/**
 * @route GET /api/test/ghn/provinces
 * @access Public (chỉ để development/test)
 * @description Test: Lấy danh sách tỉnh/thành phố
 */
router.get('/provinces', asyncHandler(async (req, res) => {
  const provinces = await ghnService.getProvinces();

  if (provinces && provinces.length > 0) {
    res.json({
      success: true,
      total: provinces.length,
      data: provinces.slice(0, 5), // Return first 5 only
      message: `Successfully retrieved ${provinces.length} provinces`
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'No provinces returned from GHN API'
    });
  }
}));

/**
 * @route GET /api/test/ghn/districts/:provinceId
 * @access Public (chỉ để development/test)
 * @param {number} provinceId - Tỉnh/thành phố ID
 * @description Test: Lấy danh sách quận/huyện theo tỉnh
 */
router.get('/districts/:provinceId', asyncHandler(async (req, res) => {
  const { provinceId } = req.params;

  if (!provinceId) {
    return res.status(400).json({
      success: false,
      error: 'provinceId is required'
    });
  }

  const districts = await ghnService.getDistricts(parseInt(provinceId));

  if (districts && districts.length > 0) {
    res.json({
      success: true,
      total: districts.length,
      data: districts.slice(0, 5),
      message: `Successfully retrieved ${districts.length} districts`
    });
  } else {
    res.status(400).json({
      success: false,
      error: `No districts found for province ${provinceId}`
    });
  }
}));

/**
 * @route GET /api/test/ghn/wards/:districtId
 * @access Public (chỉ để development/test)
 * @param {number} districtId - Quận/huyện ID
 * @description Test: Lấy danh sách phường/xã theo quận
 */
router.get('/wards/:districtId', asyncHandler(async (req, res) => {
  const { districtId } = req.params;

  if (!districtId) {
    return res.status(400).json({
      success: false,
      error: 'districtId is required'
    });
  }

  const wards = await ghnService.getWards(parseInt(districtId));

  if (wards && wards.length > 0) {
    res.json({
      success: true,
      total: wards.length,
      data: wards.slice(0, 5),
      message: `Successfully retrieved ${wards.length} wards`
    });
  } else {
    res.status(400).json({
      success: false,
      error: `No wards found for district ${districtId}`
    });
  }
}));

/**
 * @route POST /api/test/ghn/available-services
 * @access Public (chỉ để development/test)
 * @body { fromDistrictId, toDistrictId }
 * @description Test: Lấy dịch vụ khả dụng giữa 2 quận
 */
router.post('/available-services', asyncHandler(async (req, res) => {
  const { fromDistrictId, toDistrictId } = req.body;

  if (!fromDistrictId || !toDistrictId) {
    return res.status(400).json({
      success: false,
      error: 'fromDistrictId and toDistrictId are required'
    });
  }

  const services = await ghnService.getAvailableServices(fromDistrictId, toDistrictId);

  if (services && services.length > 0) {
    res.json({
      success: true,
      total: services.length,
      data: services,
      message: `Successfully retrieved ${services.length} available services`
    });
  } else {
    res.status(400).json({
      success: false,
      error: `No available services between district ${fromDistrictId} and ${toDistrictId}`
    });
  }
}));

/**
 * @route POST /api/test/ghn/calculate-fee
 * @access Public (chỉ để development/test)
 * @body { serviceId, toDistrictId, toWardCode, weight, length, width, height, insurance }
 * @description Test: Tính phí vận chuyển
 */
router.post('/calculate-fee', asyncHandler(async (req, res) => {
  const { serviceId, toDistrictId, toWardCode, weight, length, width, height, insurance } = req.body;

  // Validate
  if (!toDistrictId || !toWardCode) {
    return res.status(400).json({
      success: false,
      error: 'toDistrictId and toWardCode are required'
    });
  }

  const result = await ghnService.calculateShippingFee({
    serviceId: serviceId || 0,
    toDistrictId,
    toWardCode,
    weight: weight || 1000,
    length: length || 20,
    width: width || 20,
    height: height || 20,
    insurance: insurance || 0
  });

  if (result.success) {
    res.json({
      success: true,
      fee: result.fee,
      total: result.fee,
      details: result.data,
      message: 'Fee calculated successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * @route GET /api/test/ghn/order-status/:orderCode
 * @access Public (chỉ để development/test)
 * @param {string} orderCode - Mã đơn GHN
 * @description Test: Lấy trạng thái đơn hàng
 */
router.get('/order-status/:orderCode', asyncHandler(async (req, res) => {
  const { orderCode } = req.params;

  if (!orderCode) {
    return res.status(400).json({
      success: false,
      error: 'orderCode is required'
    });
  }

  const orderStatus = await ghnService.getOrderStatus(orderCode);

  if (orderStatus) {
    res.json({
      success: true,
      data: orderStatus,
      message: 'Order status retrieved successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      error: `Order ${orderCode} not found or invalid`
    });
  }
}));

/**
 * @route POST /api/test/ghn/full-flow
 * @access Public (chỉ để development/test)
 * @description Test: Full flow - provinces -> districts -> wards -> services -> fee
 */
router.post('/full-flow', asyncHandler(async (req, res) => {
  const { provinceId = 1, districtId = 1542, wardCode = '20308' } = req.body;

  const results = {
    step1: { name: 'Get Provinces', status: 'pending' },
    step2: { name: 'Get Districts', status: 'pending' },
    step3: { name: 'Get Wards', status: 'pending' },
    step4: { name: 'Get Available Services', status: 'pending' },
    step5: { name: 'Calculate Fee', status: 'pending' }
  };

  try {
    // Step 1: Get provinces
    const provinces = await ghnService.getProvinces();
    results.step1 = {
      name: 'Get Provinces',
      status: 'success',
      count: provinces?.length || 0
    };

    // Step 2: Get districts
    const districts = await ghnService.getDistricts(provinceId);
    results.step2 = {
      name: 'Get Districts',
      status: 'success',
      count: districts?.length || 0,
      provinceId
    };

    // Step 3: Get wards
    const wards = await ghnService.getWards(districtId);
    results.step3 = {
      name: 'Get Wards',
      status: 'success',
      count: wards?.length || 0,
      districtId
    };

    // Step 4: Get available services
    const services = await ghnService.getAvailableServices(1442, districtId);
    results.step4 = {
      name: 'Get Available Services',
      status: 'success',
      count: services?.length || 0,
      services: services?.slice(0, 3)
    };

    // Step 5: Calculate fee
    const feeResult = await ghnService.calculateShippingFee({
      serviceId: services?.[0]?.service_id || 0,
      toDistrictId: districtId,
      toWardCode: wardCode,
      weight: 1000
    });

    results.step5 = {
      name: 'Calculate Fee',
      status: feeResult.success ? 'success' : 'error',
      fee: feeResult.fee,
      error: feeResult.error
    };

    res.json({
      success: true,
      message: 'Full flow test completed',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      results,
      timestamp: new Date().toISOString()
    });
  }
}));

module.exports = router;
