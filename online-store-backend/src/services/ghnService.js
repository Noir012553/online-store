/**
 * GHN Service - Tích hợp API Giao Hàng Nhanh
 * Docs: https://api.ghn.vn/home/docs/detail
 * Dùng để tính phí vận chuyển, tạo đơn, tracking
 */

const axios = require('axios');

// GHN Configuration
const GHN_API_BASE = process.env.GHN_API_URL || 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const GHN_TOKEN = process.env.GHN_TOKEN;
const GHN_SHOP_ID = parseInt(process.env.GHN_SHOP_ID || 0);

// Validate configuration
if (!GHN_TOKEN) {
  console.warn('⚠️ GHN_TOKEN not found in environment variables. GHN API calls will fail.');
}

if (!GHN_SHOP_ID) {
  console.warn('⚠️ GHN_SHOP_ID not found or invalid. GHN API calls will fail.');
}

/**
 * Get GHN provinces
 * @returns {Promise<Array>} Array of provinces with id, province_name, code
 */
const getProvinces = async () => {
  try {
    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }

    const response = await axios.get(`${GHN_API_BASE}/master-data/province`, {
      headers: {
        'Token': GHN_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.code === 200) {
      return response.data?.data || [];
    } else {
      console.warn('GHN getProvinces returned non-200 code:', response.data?.message);
      return [];
    }
  } catch (error) {
    console.error('GHN getProvinces error:', error.message);
    return [];
  }
};

/**
 * Get GHN districts by province ID
 * @param {number} provinceId - Tỉnh/thành phố ID (bắt buộc)
 * @returns {Promise<Array>} Array of districts with district_id, district_name, code
 */
const getDistricts = async (provinceId) => {
  try {
    if (!provinceId) {
      throw new Error('provinceId is required');
    }
    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }

    const response = await axios.post(
      `${GHN_API_BASE}/master-data/district`,
      { province_id: provinceId },
      {
        headers: {
          'Token': GHN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.code === 200) {
      return response.data?.data || [];
    } else {
      console.warn('GHN getDistricts returned non-200 code:', response.data?.message);
      return [];
    }
  } catch (error) {
    console.error('GHN getDistricts error:', error.message);
    return [];
  }
};

/**
 * Get GHN wards by district ID
 * @param {number} districtId - Quận/huyện ID (bắt buộc)
 * @returns {Promise<Array>} Array of wards with ward_code, ward_name
 */
const getWards = async (districtId) => {
  try {
    if (!districtId) {
      throw new Error('districtId is required');
    }
    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }

    const response = await axios.post(
      `${GHN_API_BASE}/master-data/ward?district_id=${districtId}`,
      { district_id: districtId },
      {
        headers: {
          'Token': GHN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.code === 200) {
      return response.data?.data || [];
    } else {
      console.warn('GHN getWards returned non-200 code:', response.data?.message);
      return [];
    }
  } catch (error) {
    console.error('GHN getWards error:', error.message);
    return [];
  }
};

/**
 * Get available services between two districts
 * Ref: https://api.ghn.vn/home/docs/detail?id=77
 * @param {number} fromDistrictId - Quận/huyện lấy hàng (bắt buộc)
 * @param {number} toDistrictId - Quận/huyện đích (bắt buộc)
 * @returns {Promise<Array>} Array of available services with service_id, short_name, service_type_id
 */
const getAvailableServices = async (fromDistrictId, toDistrictId) => {
  try {
    // Validate required fields
    if (!fromDistrictId) {
      throw new Error('fromDistrictId is required');
    }
    if (!toDistrictId) {
      throw new Error('toDistrictId is required');
    }
    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }
    if (!GHN_SHOP_ID) {
      throw new Error('GHN_SHOP_ID is not configured');
    }

    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/available-services`,
      {
        shop_id: GHN_SHOP_ID,
        from_district: fromDistrictId,
        to_district: toDistrictId
      },
      {
        headers: {
          'Token': GHN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.code === 200) {
      return response.data?.data || [];
    } else {
      console.warn('GHN getAvailableServices returned non-200 code:', response.data?.message);
      return [];
    }
  } catch (error) {
    console.error('GHN getAvailableServices error:', error.message);
    return [];
  }
};

/**
 * Calculate shipping fee
 * Ref: https://api.ghn.vn/home/docs/detail?id=95
 * @param {Object} params
 * @param {number} params.serviceId - Service ID (lấy từ available-services)
 * @param {number} params.toDistrictId - Quận/huyện đích (bắt buộc)
 * @param {string} params.toWardCode - Phường/xã đích (bắt buộc)
 * @param {number} params.weight - Cân nặng (gram, mặc định 1000)
 * @param {number} params.length - Chiều dài (cm, mặc định 20)
 * @param {number} params.width - Chiều rộng (cm, mặc định 20)
 * @param {number} params.height - Chiều cao (cm, mặc định 20)
 * @param {number} params.insurance - Giá trị bảo hiểm (đồng, mặc định 0)
 * @param {string} params.fromDistrictId - Quận/huyện lấy hàng (mặc định 1442 - Q1 HCM)
 */
const calculateShippingFee = async (params) => {
  try {
    const {
      serviceId = 0,
      toDistrictId,
      toWardCode,
      weight = 1000,
      length = 20,
      width = 20,
      height = 20,
      insurance = 0,
      fromDistrictId = 1442 // Quận 1, TP.HCM (default warehouse)
    } = params;

    // Validate required fields
    if (!toDistrictId) {
      throw new Error('toDistrictId is required');
    }
    if (!toWardCode) {
      throw new Error('toWardCode is required');
    }
    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }
    if (!GHN_SHOP_ID) {
      throw new Error('GHN_SHOP_ID is not configured');
    }

    // Validate numeric values
    if (weight <= 0) {
      throw new Error('Weight must be greater than 0');
    }
    if (length <= 0 || width <= 0 || height <= 0) {
      throw new Error('Dimensions (length, width, height) must be greater than 0');
    }

    const payload = {
      service_id: serviceId,
      from_district_id: fromDistrictId,
      to_district_id: toDistrictId,
      to_ward_code: toWardCode,
      weight,
      length,
      width,
      height,
      insurance_value: insurance
    };

    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/fee`,
      payload,
      {
        headers: {
          'Token': GHN_TOKEN,
          'ShopId': GHN_SHOP_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.code === 200) {
      return {
        success: true,
        fee: response.data?.data?.total || 0,
        data: response.data?.data
      };
    } else {
      return {
        success: false,
        fee: 0,
        error: response.data?.message || 'Failed to calculate fee'
      };
    }
  } catch (error) {
    console.error('GHN calculateShippingFee error:', error.message);
    return {
      success: false,
      fee: 0,
      error: error.message
    };
  }
};

/**
 * Create shipping order
 * Ref: https://api.ghn.vn/home/docs/detail?id=82
 * @param {Object} orderData
 * @param {string} orderData.clientOrderCode - Mã đơn từ hệ thống (bắt buộc)
 * @param {string} orderData.toName - Tên người nhận (bắt buộc)
 * @param {string} orderData.toPhone - Số điện thoại (bắt buộc)
 * @param {string} orderData.toAddress - Địa chỉ nhận (bắt buộc)
 * @param {number} orderData.toDistrictId - Quận/huyện (bắt buộc)
 * @param {string} orderData.toWardCode - Phường/xã (bắt buộc)
 * @param {number} orderData.serviceId - Service ID từ available-services (bắt buộc)
 * @param {number} orderData.weight - Cân nặng gram (mặc định 1000)
 * @param {number} orderData.length - Chiều dài cm (mặc định 20)
 * @param {number} orderData.width - Chiều rộng cm (mặc định 20)
 * @param {number} orderData.height - Chiều cao cm (mặc định 20)
 * @param {number} orderData.paymentTypeId - 1: Shop trả, 2: Khách trả (mặc định 2)
 * @param {number} orderData.codAmount - Tiền COD (mặc định 0)
 * @param {string} orderData.content - Nội dung đơn (bắt buộc)
 * @param {string} orderData.note - Ghi chú (tùy chọn)
 */
const createShippingOrder = async (orderData) => {
  try {
    const {
      clientOrderCode,
      toName,
      toPhone,
      toAddress,
      toDistrictId,
      toWardCode,
      serviceId,
      weight = 1000,
      length = 20,
      width = 20,
      height = 20,
      paymentTypeId = 2, // 1: Shop trả, 2: Khách trả
      codAmount = 0,
      content = 'Online Order',
      note = ''
    } = orderData;

    // Validate required fields
    const requiredFields = {
      clientOrderCode,
      toName,
      toPhone,
      toAddress,
      toDistrictId,
      toWardCode,
      serviceId,
      content
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) {
        throw new Error(`${field} is required`);
      }
    }

    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }
    if (!GHN_SHOP_ID) {
      throw new Error('GHN_SHOP_ID is not configured');
    }

    // Validate phone number format
    if (!/^\d{10,11}$/.test(toPhone?.replace(/\D/g, ''))) {
      throw new Error('Invalid phone number format. Must be 10-11 digits');
    }

    // Validate dimensions
    if (weight <= 0 || length <= 0 || width <= 0 || height <= 0) {
      throw new Error('Weight and dimensions must be greater than 0');
    }

    const payload = {
      payment_type_id: paymentTypeId,
      note: note || '',
      required_note: 'KHONGCHOXEMHANG', // Khách không được xem hàng
      return_phone: process.env.GHN_RETURN_PHONE || '0901234567',
      return_address: process.env.GHN_RETURN_ADDRESS || 'Kho hàng',
      return_district_id: 1442, // Default Q1 HCM
      return_ward_code: '20308', // Default ward
      client_order_code: clientOrderCode,
      to_name: toName,
      to_phone: toPhone,
      to_address: toAddress,
      to_ward_code: toWardCode,
      to_district_id: toDistrictId,
      cod_amount: codAmount,
      content,
      weight,
      length,
      width,
      height,
      service_id: serviceId
    };

    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/create`,
      payload,
      {
        headers: {
          'Token': GHN_TOKEN,
          'ShopId': GHN_SHOP_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.code === 200) {
      return {
        success: true,
        orderId: response.data?.data?.order_code,
        data: response.data?.data
      };
    } else {
      return {
        success: false,
        error: response.data?.message || 'Failed to create order'
      };
    }
  } catch (error) {
    console.error('GHN createShippingOrder error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get order status
 * Ref: https://api.ghn.vn/home/docs/detail?id=99
 * @param {string} orderCode - Mã đơn GHN (bắt buộc)
 * @returns {Promise<Object|null>} Order details or null if error
 */
const getOrderStatus = async (orderCode) => {
  try {
    // Validate required fields
    if (!orderCode) {
      throw new Error('orderCode is required');
    }
    if (!GHN_TOKEN) {
      throw new Error('GHN_TOKEN is not configured');
    }
    if (!GHN_SHOP_ID) {
      throw new Error('GHN_SHOP_ID is not configured');
    }

    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/detail`,
      { order_code: orderCode },
      {
        headers: {
          'Token': GHN_TOKEN,
          'ShopId': GHN_SHOP_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.code === 200) {
      return response.data?.data || null;
    } else {
      console.warn('GHN getOrderStatus returned non-200 code:', response.data?.message);
      return null;
    }
  } catch (error) {
    console.error('GHN getOrderStatus error:', error.message);
    return null;
  }
};

module.exports = {
  getProvinces,
  getDistricts,
  getWards,
  getAvailableServices,
  calculateShippingFee,
  createShippingOrder,
  getOrderStatus
};
