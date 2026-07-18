/**
 * Controller quản lý vận chuyển
 * Xử lý: tính phí, lấy danh sách carrier, location data (provinces/districts/wards)
 */

const asyncHandler = require('express-async-handler');
const shippingService = require('../services/shippingService');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');

const WAREHOUSE_DISTRICT_ID = Number(process.env.GHN_WAREHOUSE_DISTRICT_ID) || 1458;

/**
 * Lấy danh sách nhà vận chuyển đang hoạt động
 * @route GET /api/shipping/providers
 * @access Public
 */
const getProviders = asyncHandler(async (req, res) => {
  try {
    const defaultLang = getDefaultLanguage();
    const lang = (req.query.lang || defaultLang.code).toUpperCase();
    const providers = await shippingService.getActiveProviders();

    if (providers.length === 0) {
      return res.status(400).json({
        success: false,
        message: getMessage(lang, 'shipping.noProvidersConfigured'),
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
    if (process.env.NODE_ENV === 'development') {
      console.error('getProviders error:', error);
    }
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
 *   to: {districtId, wardCode},
 *   weight: number (gram),
 *   value?: number (VND)
 * }
 * @access Public
 */
const calculateShipping = asyncHandler(async (req, res) => {
  const { to, weight, value } = req.body;
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || req.body.lang || defaultLang.code).toUpperCase();
  const districtId = Number(to?.districtId);
  const wardCode = typeof to?.wardCode === 'string' ? to.wardCode.trim() : '';
  const normalizedWeight = Number(weight);

  if (!Number.isInteger(districtId) || districtId <= 0 || !wardCode) {
    return res.status(400).json({
      success: false,
      message: getMessage(lang, 'shipping.missingParameters'),
    });
  }

  if (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0) {
    return res.status(400).json({
      success: false,
      message: getMessage(lang, 'shipping.weightMustBePositive'),
    });
  }

  try {
    const result = await shippingService.calculateShippingFromAllCarriers({
      from: { districtId: WAREHOUSE_DISTRICT_ID },
      to: { districtId, wardCode },
      weight: normalizedWeight,
      value,
      lang,
    });

    if (!result.success) {
      return res.status(502).json({
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
            currencyCode: carrier.data.currencyCode,
          });
        });
      }
    });

    res.json({
      success: true,
      weight: normalizedWeight,
      options: allOptions.sort((a, b) => a.fee - b.fee),
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('calculateShipping error:', error);
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.error('getProvinces error:', error);
    }
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
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toUpperCase();

  if (!provinceId) {
    return res.status(400).json({
      success: false,
      message: getMessage(lang, 'validation.shipping.provinceRequired'),
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
    if (process.env.NODE_ENV === 'development') {
      console.error('getDistricts error:', error);
    }
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
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toUpperCase();

  const parsedDistrictId = Number(districtId);
  if (!Number.isInteger(parsedDistrictId) || parsedDistrictId <= 0) {
    return res.status(400).json({
      success: false,
      message: getMessage(lang, 'validation.shipping.provinceRequired'),
    });
  }

  try {
    const result = await shippingService.getWards(parsedDistrictId, lang);

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
    if (process.env.NODE_ENV === 'development') {
      console.error('getWards error:', error);
    }
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
