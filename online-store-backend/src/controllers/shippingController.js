/**
 * Controller for shipping methods
 * Tích hợp GHN API thực + Mock data fallback
 */
const asyncHandler = require('express-async-handler');
const paymentIntegrationService = require('../services/paymentIntegrationService');
const ghnService = require('../services/ghnService');

/**
 * Get all shipping methods
 * @route GET /api/shipping-methods
 * @access Public
 * @returns Array of GHN shipping methods
 * Note: Actual shipping options are fetched dynamically based on customer location
 * via calculateShippingFee endpoint
 */
const getShippingMethods = asyncHandler(async (req, res) => {
  // GHN services info (general info only)
  // Actual fees are calculated based on customer location
  const shippingMethods = [
    {
      id: 'ghn',
      name: 'Giao Hàng Nhanh',
      description: 'Dịch vụ vận chuyển của GHN',
      carrier: 'GHN',
      logo: 'https://api.nhathuoclongchau.com.vn/master/product/2024/01/17/0f893f8f-c1f4-44af-9d76-eb9eac9f66fe.png',
      icon: '📦',
      note: 'Phí vận chuyển sẽ được tính dựa trên địa điểm giao hàng'
    }
  ];

  res.json(shippingMethods);
});


/**
 * Calculate shipping fee with real GHN API
 * @route POST /api/shipping/calculate-fee
 * @access Public
 * @body { districtId, wardCode, weight }
 * @returns Array of GHN shipping options with real fees from GHN API
 */
const calculateShippingFee = asyncHandler(async (req, res) => {
  const { districtId, wardCode, weight = 1000 } = req.body;

  if (!districtId || !wardCode) {
    res.status(400);
    throw new Error('Missing required fields: districtId, wardCode');
  }

  // Get real GHN shipping options with fees from GHN API
  const shippingOptions = await paymentIntegrationService.getShippingOptionsWithFee(
    districtId,
    wardCode,
    weight
  );

  if (!shippingOptions || shippingOptions.length === 0) {
    res.status(400);
    throw new Error('No shipping options available for this location');
  }

  res.json(shippingOptions);
});

/**
 * Get GHN provinces
 * @route GET /api/shipping/ghn/provinces
 * @access Public
 */
const getGHNProvinces = asyncHandler(async (req, res) => {
  const provinces = await ghnService.getProvinces();
  res.json(provinces);
});

/**
 * Get GHN districts by province
 * @route GET /api/shipping/ghn/districts/:provinceId
 * @access Public
 */
const getGHNDistricts = asyncHandler(async (req, res) => {
  const { provinceId } = req.params;
  const districts = await ghnService.getDistricts(parseInt(provinceId));
  res.json(districts);
});

/**
 * Get GHN wards by district
 * @route GET /api/shipping/ghn/wards/:districtId
 * @access Public
 */
const getGHNWards = asyncHandler(async (req, res) => {
  const { districtId } = req.params;
  const wards = await ghnService.getWards(parseInt(districtId));
  res.json(wards);
});

module.exports = {
  getShippingMethods,
  calculateShippingFee,
  getGHNProvinces,
  getGHNDistricts,
  getGHNWards
};
