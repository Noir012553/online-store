/**
 * Controller quản lý vận chuyển
 * Xử lý: tính phí, lấy danh sách carrier, location data (provinces/districts/wards)
 */

const asyncHandler = require('express-async-handler');
const shippingService = require('../services/shippingService');

/**
 * Lấy danh sách nhà vận chuyển đang hoạt động
 * @route GET /api/shipping/providers
 * @access Public
 */
const getProviders = asyncHandler(async (req, res) => {
  try {
    const providers = await shippingService.getActiveProviders();

    if (providers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có nhà vận chuyển nào được cấu hình',
      });
    }

    res.json({
      success: true,
      count: providers.length,
      providers: providers.map((p) => ({
        id: p._id,
        code: p.code,
        name: p.name,
        logo: p.logo,
        description: p.description,
        serviceTypes: p.serviceTypes,
      })),
    });
  } catch (error) {
    console.error('getProviders error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Tính phí vận chuyển từ tất cả carriers
 * Trả về danh sách options với giá từ mỗi carrier
 * @route POST /api/shipping/calculate
 * @body {
 *   from: {districtId},
 *   to: {districtId, wardCode},
 *   weight: number (gram),
 *   value?: number (VND)
 * }
 * @access Public
 */
const calculateShipping = asyncHandler(async (req, res) => {
  const { from, to, weight, value } = req.body;

  // Validate input
  if (!from?.districtId || !to?.districtId || !to?.wardCode || !weight) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp: from.districtId, to.districtId, to.wardCode, weight',
    });
  }

  if (weight <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Cân nặng phải lớn hơn 0',
    });
  }

  try {
    const result = await shippingService.calculateShippingFromAllCarriers({
      from,
      to,
      weight,
      value,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
        details: result.details,
      });
    }

    // Merge và sort results theo giá
    const allOptions = [];
    result.carriers.forEach((carrier) => {
      if (carrier.data?.services) {
        carrier.data.services.forEach((service) => {
          allOptions.push({
            provider: carrier.data.provider,
            providerName: carrier.data.providerName,
            serviceType: service.serviceType,
            serviceName: service.serviceName,
            estimatedDays: service.estimatedDays,
            fee: service.fee,
          });
        });
      }
    });

    res.json({
      success: true,
      weight,
      options: allOptions.sort((a, b) => a.fee - b.fee),
    });
  } catch (error) {
    console.error('calculateShipping error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Lấy danh sách tỉnh/thành (từ GHN)
 * @route GET /api/shipping/locations/provinces
 * @access Public
 */
const getProvinces = asyncHandler(async (req, res) => {
  try {
    const result = await shippingService.getProvinces();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.json({
      success: true,
      count: result.provinces.length,
      provinces: result.provinces,
    });
  } catch (error) {
    console.error('getProvinces error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Lấy danh sách quận/huyện của một tỉnh
 * @route GET /api/shipping/locations/districts
 * @query provinceId - ID tỉnh (bắt buộc)
 * @access Public
 */
const getDistricts = asyncHandler(async (req, res) => {
  const { provinceId } = req.query;

  if (!provinceId) {
    return res.status(400).json({
      success: false,
      message: 'provinceId là bắt buộc',
    });
  }

  try {
    const result = await shippingService.getDistricts(parseInt(provinceId));

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.json({
      success: true,
      count: result.districts.length,
      districts: result.districts,
    });
  } catch (error) {
    console.error('getDistricts error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Lấy danh sách phường/xã của một quận
 * @route GET /api/shipping/locations/wards
 * @query districtId - ID quận (bắt buộc)
 * @access Public
 */
const getWards = asyncHandler(async (req, res) => {
  const { districtId } = req.query;

  if (!districtId) {
    return res.status(400).json({
      success: false,
      message: 'districtId là bắt buộc',
    });
  }

  try {
    const result = await shippingService.getWards(parseInt(districtId));

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.json({
      success: true,
      count: result.wards.length,
      wards: result.wards,
    });
  } catch (error) {
    console.error('getWards error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = {
  getProviders,
  calculateShipping,
  getProvinces,
  getDistricts,
  getWards,
};
