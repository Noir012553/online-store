const axios = require('axios');
const ShippingProvider = require('../models/ShippingProvider');

const GHN_BASE_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const GHN_TIMEOUT = 10000;

async function getGhnClient() {
  const provider = await ShippingProvider.getByCode('ghn');

  if (!provider) {
    console.error('[GHN_ERROR] GHN provider not found in database');
    console.error('[GHN_HELP] To configure GHN:');
    console.error('  1. Add GHN_API_TOKEN to .env file');
    console.error('  2. Run: npm run seed (or node src/seeds/ghnSeeder.js)');
    throw new Error('GHN provider không được cấu hình. Vui lòng thêm GHN_API_TOKEN vào .env và chạy seed.');
  }

  const headers = {
    'Token': provider.apiKey,
    'Content-Type': 'application/json',
  };

  if (process.env.GHN_SHOP_ID) {
    headers['ShopId'] = process.env.GHN_SHOP_ID;
  }

  const client = axios.create({
    baseURL: GHN_BASE_URL,
    timeout: GHN_TIMEOUT,
    headers,
  });

  return client;
}

/**
 * Kiểm tra xem district_id có tồn tại trong hệ thống GHN không
 * Giúp debug lỗi 400 khi gửi invalid district_id
 */
async function validateDistrictIds({ from_district_id, to_district_id }) {
  try {

    // Cache provinces & districts để tránh gọi API nhiều lần
    const provincesData = await getProvinces();
    const allDistricts = [];

    for (const province of provincesData) {
      const districts = await getDistricts(province.ProvinceID);
      allDistricts.push(...districts);
    }

    const fromExists = allDistricts.some((d) => d.DistrictID === from_district_id);
    const toExists = allDistricts.some((d) => d.DistrictID === to_district_id);

    if (!fromExists) {
      console.warn(
        `⚠️ [validateDistrictIds] from_district_id: ${from_district_id} KHÔNG TỒN TẠI trong GHN`
      );
    }
    if (!toExists) {
      console.warn(
        `⚠️ [validateDistrictIds] to_district_id: ${to_district_id} KHÔNG TỒN TẠI trong GHN`
      );
    }

    return {
      fromExists,
      toExists,
      valid: fromExists && toExists,
    };
  } catch (error) {
    console.error('[validateDistrictIds] Error:', error.message);
    return {
      fromExists: null,
      toExists: null,
      valid: null, // Unknown
    };
  }
}

async function getProvinces() {
  try {
    const client = await getGhnClient();
    const response = await client.get('/master-data/province');

    if (response.data && response.data.code === 200) {
      return response.data.data || [];
    }

    throw new Error(`GHN API error: ${response.data.message}`);
  } catch (error) {
    console.error('GHN getProvinces error:', error.message);
    throw new Error(`Lỗi khi lấy dữ liệu tỉnh/thành từ GHN: ${error.message}`);
  }
}

async function getDistricts(provinceId) {
  if (!provinceId) {
    throw new Error('provinceId là bắt buộc');
  }

  try {
    const client = await getGhnClient();
    const response = await client.post('/master-data/district', {
      province_id: provinceId,
    });

    if (response.data && response.data.code === 200) {
      return response.data.data || [];
    }

    throw new Error(`GHN API error: ${response.data.message}`);
  } catch (error) {
    console.error('GHN getDistricts error:', error.message);
    throw new Error(`Lỗi khi lấy dữ liệu quận/huyện từ GHN: ${error.message}`);
  }
}

async function getWards(districtId) {
  if (!districtId) {
    throw new Error('districtId là bắt buộc');
  }

  try {
    const client = await getGhnClient();
    const response = await client.post('/master-data/ward', {
      district_id: districtId,
    });

    if (response.data && response.data.code === 200) {
      return response.data.data || [];
    }

    throw new Error(`GHN API error: ${response.data.message}`);
  } catch (error) {
    console.error('GHN getWards error:', error.message);
    throw new Error(`Lỗi khi lấy dữ liệu phường/xã từ GHN: ${error.message}`);
  }
}

async function validateProvincDistrictWard({ provinceId, districtId, wardId }) {
  try {
    if (!provinceId || !districtId || !wardId) {
      return {
        valid: false,
        error: 'provinceId, districtId và wardId là bắt buộc',
      };
    }

    const provinces = await getProvinces();
    const province = provinces.find((p) => p.ProvinceID === provinceId);

    if (!province) {
      return {
        valid: false,
        error: `Tỉnh/thành có ID ${provinceId} không tồn tại`,
      };
    }

    const districts = await getDistricts(provinceId);
    const district = districts.find((d) => d.DistrictID === districtId);

    if (!district) {
      return {
        valid: false,
        error: `Quận/huyện có ID ${districtId} không tồn tại trong tỉnh ${province.ProvinceName}`,
      };
    }

    const wards = await getWards(districtId);
    const ward = wards.find((w) => w.WardID === wardId);

    if (!ward) {
      return {
        valid: false,
        error: `Phường/xã có ID ${wardId} không tồn tại trong quận ${district.DistrictName}`,
      };
    }

    return {
      valid: true,
      province,
      district,
      ward,
    };
  } catch (error) {
    console.error('validateProvincDistrictWard error:', error.message);
    return {
      valid: false,
      error: error.message,
    };
  }
}

async function calculateShippingFee({
  from_district_id,
  to_district_id,
  to_ward_code,
  weight,
  service_id,
  insurance_value,
}) {
  try {
    // 1. CHUẨN HÓA DỮ LIỆU (Normalization - Giải quyết Case 2 & 3)
    // GHN yêu cầu số nguyên, không chấp nhận null/undefined cho các trường kích thước
    const finalWeight = Math.max(Number(weight) || 0, 100); // Tối thiểu 100g cho lót chuột
    const finalLength = 15; // Tăng lên 15cm để dán vừa tem vận đơn A6
    const finalWidth = 10;
    const finalHeight = 10;

    // 2. Kiểm tra tham số bắt buộc sau khi đã ép kiểu
    if (!from_district_id || !to_district_id || !to_ward_code) {
      return {
        success: false,
        error: 'from_district_id, to_district_id và to_ward_code là bắt buộc',
      };
    }

    const from_id = Number(from_district_id);
    const to_id = Number(to_district_id);
    const to_code = String(to_ward_code);


    // 3. Xử lý trùng địa chỉ (Fallback #1)
    // Nếu gửi và nhận ở cùng quận, tự động trả về phí 0 (đơn hàng nội tỉnh có thể lấy từ kho)
    if (from_id === to_id) {
      console.log(
        '💡 Phát hiện trùng địa chỉ gửi/nhận → Miễn phí vận chuyển. (from_id: ' +
          from_id +
          ' === to_id: ' +
          to_id +
          ')'
      );
      return {
        success: true,
        data: {
          total: 0,
          service_fee: 0,
          insurance_fee: 0,
          message: 'Cùng quận - Miễn phí vận chuyển',
        },
      };
    }

    // 4. Kiểm tra service_id bắt buộc (đã được lấy từ getAvailableServices)
    if (!service_id) {
      return {
        success: false,
        error: 'service_id là bắt buộc. Hãy gọi getAvailableServices trước để lấy danh sách dịch vụ khả dụng.',
      };
    }

    const client = await getGhnClient();

    // ✅ Payload chuẩn xác từ script PowerShell đã chứng minh
    // Bắt buộc: shop_id, service_id, from_district_id, to_district_id, to_ward_code, weight, length, width, height, insurance_value
    const payload = {
      shop_id: Number(process.env.GHN_SHOP_ID),  // ✅ Bắt buộc (Number)
      service_id: Number(service_id),            // ✅ Bắt buộc từ getAvailableServices (Number)
      from_district_id: from_id,                 // ✅ from_district_id có _id (Number)
      to_district_id: to_id,                     // ✅ to_district_id có _id (Number)
      to_ward_code: to_code,                     // ✅ String
      weight: Math.round(finalWeight),           // ✅ Number (gram)
      length: finalLength,                       // ✅ Number (cm)
      width: finalWidth,                         // ✅ Number (cm)
      height: finalHeight,                       // ✅ Number (cm)
      insurance_value: Number(insurance_value) || 0, // ✅ Number (đồng), quan trọng cho phí bảo hiểm
    };


    // Gửi request tới GHN API
    const response = await client.post('/v2/shipping-order/fee', payload);

    if (response.data && response.data.code === 200 && response.data.data) {
      const feeData = response.data.data;
      console.log('✅ [calculateShippingFee] Tính phí thành công:');
      console.log(`   Phí dịch vụ: ${feeData.service_fee} VNĐ`);
      console.log(`   Phí bảo hiểm: ${feeData.insurance_fee} VNĐ`);
      console.log(`   Tổng phí: ${feeData.total} VNĐ`);

      return {
        success: true,
        data: feeData,
      };
    }

    throw new Error(response.data.message || 'Lỗi không xác định từ GHN');
  } catch (error) {
    const detailedError = error.response?.data?.message || error.message;

    return {
      success: false,
      error: detailedError,
    };
  }
}

function getServiceTypes() {
  return {
    services: [
      {
        id: 53321,
        code: 'standard',
        name: 'Giao hàng tiêu chuẩn',
        estimatedDays: '2-3 ngày',
        description: 'Tiêu chuẩn, giá thấp nhất',
      },
      {
        id: 53322,
        code: 'express',
        name: 'Giao hàng nhanh',
        estimatedDays: '1-2 ngày',
        description: 'Nhanh hơn, giá cao hơn',
      },
    ],
  };
}

/**
 * Lấy danh sách dịch vụ khả dụng giữa 2 địa điểm từ GHN
 * Hàm này gọi GHN API để lấy những service_id nào được hỗ trợ cho tuyến đường cụ thể
 *
 * @param {number} from_district_id - ID quận/huyện gửi
 * @param {number} to_district_id - ID quận/huyện nhận
 * @returns {Promise<Array>} Danh sách các service khả dụng với service_id, service_type_id, service_code...
 */
async function getAvailableServices({ from_district_id, to_district_id }) {
  // Define early to avoid ReferenceError in catch block
  let from_id = null;
  let to_id = null;

  try {
    // Validate input
    if (!from_district_id || !to_district_id) {
      throw new Error('from_district_id và to_district_id là bắt buộc');
    }

    from_id = Number(from_district_id);
    to_id = Number(to_district_id);

    // Validate district IDs before calling API
    const districtValidation = await validateDistrictIds({
      from_district_id: from_id,
      to_district_id: to_id,
    });

    if (districtValidation.valid === false) {
      console.error(
        `❌ [getAvailableServices] Invalid district IDs detected!`
      );
      if (!districtValidation.fromExists) {
        throw new Error(
          `from_district_id ${from_id} không tồn tại trong GHN. Vui lòng kiểm tra lại.`
        );
      }
      if (!districtValidation.toExists) {
        throw new Error(
          `to_district_id ${to_id} không tồn tại trong GHN. Vui lòng kiểm tra lại.`
        );
      }
    }

    const client = await getGhnClient();

    // ⚠️ GHN Sandbox API /available-services yêu cầu format chính xác
    // ✅ ĐÚNG: shop_id, from_district, to_district (snake_case, bỏ chữ _id, tất cả Number)
    // Đây là lý do 400 error trước đây - Field names phải khớp CHÍNH XÁC với API schema
    const payload = {
      shop_id: Number(process.env.GHN_SHOP_ID),   // ✅ snake_case + Number
      from_district: Number(from_id),             // ✅ Bỏ chữ _id, snake_case + Number
      to_district: Number(to_id),                 // ✅ Bỏ chữ _id, snake_case + Number
    };


    const response = await client.post('/v2/shipping-order/available-services', payload);

    if (response.data && response.data.code === 200) {
      const availableServices = response.data.data || [];


      return availableServices;
    }

    throw new Error(`GHN API error: ${response.data.message}`);
  } catch (error) {
    // Detailed error logging for debugging
    console.error('❌ [getAvailableServices] ERROR DETAILS:');
    console.error('   Status Code:', error.response?.status);
    console.error('   Error Message:', error.message);
    console.error('   Response Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('   Request Payload (snake_case):', JSON.stringify({
      shop_id: Number(process.env.GHN_SHOP_ID || 0),
      from_district: from_id,
      to_district: to_id,
    }, null, 2));
    console.error('   Payload Types:', {
      shop_id: typeof Number(process.env.GHN_SHOP_ID),
      from_district: typeof from_id,
      to_district: typeof to_id,
    });
    console.error('   Request Headers:', {
      'Token': '***HIDDEN***',
      'ShopId': process.env.GHN_SHOP_ID || 'NOT_SET',
      'Content-Type': 'application/json',
    });

    throw new Error(`Lỗi khi lấy danh sách dịch vụ từ GHN: ${error.message}`);
  }
}

async function createShipment(params) {
  try {
    const {
      payment_type_id,
      required_note,
      to_name,
      to_phone,
      to_address,
      to_district_id,
      to_ward_code,
      weight,
      length,
      width,
      height,
      service_id,
      service_type_id,
      items,
      from_district_id,
      from_ward_code,
      customer_phone,
      customer_name,
      customer_address,
      insurance_value,
    } = params;

    // Validation
    if (!to_name || !to_phone || !to_address || !to_district_id || !to_ward_code || !weight || !items) {
      return {
        success: false,
        error: 'Vui lòng cung cấp: to_name, to_phone, to_address, to_district_id, to_ward_code, weight, items',
      };
    }

    const client = await getGhnClient();

    // 1. Tính phí vận chuyển trước
    const feeResult = await calculateShippingFee({
      from_district_id: from_district_id || 1458,
      to_district_id,
      to_ward_code,
      weight,
      service_id,
      insurance_value,
    });

    if (!feeResult.success) {
      return {
        success: false,
        error: `Không thể tính phí vận chuyển: ${feeResult.error}`,
      };
    }

    // 2. Xây dựng payload để tạo đơn hàng
    // ⚠️ GHN API yêu cầu shop_id bắt buộc trong body (snake_case)
    const payload = {
      shop_id: Number(process.env.GHN_SHOP_ID), // ✅ GHN yêu cầu shop_id trong body (snake_case)
      payment_type_id: payment_type_id || 2, // 2 = Người mua trả phí
      required_note: required_note || 'CHOXEMHANGKHONGTHU', // Cho xem hàng không thử
      to_name,
      to_phone,
      to_address,
      to_district_id: Number(to_district_id),
      to_ward_code: String(to_ward_code),
      weight: Math.round(Number(weight)),
      length: Number(length) || 15,
      width: Number(width) || 10,
      height: Number(height) || 10,
      items,
      from_district_id: Number(from_district_id || 1458),
      from_ward_code: String(from_ward_code || '21905'),
      insurance_value: Number(insurance_value) || 0,
    };

    // Nếu có service_id, sử dụng nó; nếu không dùng service_type_id
    if (service_id) {
      payload.service_id = Number(service_id);
    } else if (service_type_id) {
      payload.service_type_id = Number(service_type_id);
    } else {
      payload.service_type_id = 2; // Mặc định: giao hàng chuẩn
    }


    // 3. Gọi GHN API để tạo đơn hàng (với Fallback cho Service ID)
    let response;
    let isUsingServiceTypeIdFallback = false;

    try {
      response = await client.post('/v2/shipping-order/create', payload);
    } catch (initialError) {
      // ⚠️ FALLBACK: Nếu service_id không được hỗ trợ, thử dùng service_type_id: 2
      const errorMessage = initialError.response?.data?.message || initialError.message;

      if (
        errorMessage.includes('Service') ||
        errorMessage.includes('service') ||
        errorMessage.includes('route not found') ||
        errorMessage.includes('không hỗ trợ')
      ) {
        console.warn(
          '⚠️ [createShipment] Service ID không hỗ trợ cho tuyến đường này. Thử fallback với service_type_id: 2...'
        );

        // Xóa service_id và dùng service_type_id thay thế
        const fallbackPayload = { ...payload };
        delete fallbackPayload.service_id;
        fallbackPayload.service_type_id = 2; // Dịch vụ chuẩn - được hỗ trợ rộng rãi


        response = await client.post('/v2/shipping-order/create', fallbackPayload);
        isUsingServiceTypeIdFallback = true;
      } else {
        // Nếu lỗi không phải về Service, throw ngay
        throw initialError;
      }
    }

    if (response.data && response.data.code === 200) {
      const orderData = response.data.data;

      // ✅ Log order_code rõ ràng (Mã ED...VN)
      const orderCodeNorm = orderData.order_code_norm || orderData.order_code;
      console.log('✅ [createShipment] Tạo đơn hàng thành công!');
      if (isUsingServiceTypeIdFallback) {
        console.log('   💡 Ghi chú: Đã sử dụng fallback service_type_id: 2');
      }
      console.log(`   📍 Mã vận đơn GHN: ${orderData.order_code} (Dùng mã này để tracking trên 5sao)`);
      console.log(`   📋 Order Code Norm: ${orderCodeNorm}${!orderData.order_code_norm ? ' (fallback from order_code)' : ''}`);
      console.log(`   ⏱️  Dự kiến giao: ${orderData.expected_delivery_time}`);
      console.log(`   💰 Tổng phí: ${orderData.total_fee?.toLocaleString('vi-VN')} đ`);

      return {
        success: true,
        data: {
          order_code: orderData.order_code, // ← Mã ED...VN (cần lưu vào Order)
          order_code_norm: orderData.order_code_norm || orderData.order_code, // Fallback to order_code if norm not provided
          expected_delivery_time: orderData.expected_delivery_time,
          total_fee: orderData.total_fee,
          ...orderData,
        },
      };
    }

    throw new Error(response.data.message || 'Lỗi không xác định từ GHN');
  } catch (error) {
    const detailedError = error.response?.data?.message || error.message;
    console.error('❌ [createShipment] Lỗi tạo đơn:', detailedError);
    console.error('❌ [createShipment] Full error:', error.response?.data || error);
    return {
      success: false,
      error: detailedError,
    };
  }
}

async function getPrintToken(orderCodes) {
  try {
    if (!orderCodes || orderCodes.length === 0) {
      return {
        success: false,
        error: 'orderCodes là bắt buộc',
      };
    }

    const client = await getGhnClient();

    const response = await client.post('/v2/a5/gen-token', {
      order_codes: orderCodes,
    });

    if (response.data && response.data.code === 200) {
      return {
        success: true,
        data: response.data.data,
      };
    }

    throw new Error(`GHN API error: ${response.data.message}`);
  } catch (error) {
    console.error('getPrintToken error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getShipmentInfo(orderCode) {
  try {
    if (!orderCode) {
      return {
        success: false,
        error: 'orderCode là bắt buộc',
      };
    }

    const client = await getGhnClient();

    const response = await client.get(`/v2/shipping-order/detail`, {
      params: { order_code: orderCode },
    });

    if (response.data && response.data.code === 200) {
      return {
        success: true,
        data: response.data.data,
      };
    }

    throw new Error(`GHN API error: ${response.data.message}`);
  } catch (error) {
    console.error('getShipmentInfo error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  getProvinces,
  getDistricts,
  getWards,
  validateProvincDistrictWard,
  validateDistrictIds,
  calculateShippingFee,
  getServiceTypes,
  getAvailableServices,
  createShipment,
  getPrintToken,
  getShipmentInfo,
};
