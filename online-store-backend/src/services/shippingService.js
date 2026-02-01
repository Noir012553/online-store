const ShippingProvider = require('../models/ShippingProvider');
const { Province, District, Ward } = require('../models/Location');
const ghnService = require('./ghnService');
const { GHNAdapter } = require('../adapters/carrierAdapters');

async function getActiveProviders() {
  try {
    const providers = await ShippingProvider.find({
      isActive: true,
      isDeleted: false,
    }).select('-apiKey');

    return providers;
  } catch (error) {
    console.error('getActiveProviders error:', error.message);
    throw error;
  }
}

async function calculateShippingFromAllCarriers({ from, to, weight, value }) {
  try {
    if (!from?.districtId || !to?.districtId || !weight) {
      return {
        success: false,
        error: 'from.districtId, to.districtId và weight là bắt buộc',
      };
    }

    const providers = await getActiveProviders();

    if (providers.length === 0) {
      return {
        success: false,
        error: 'Không có nhà vận chuyển nào được cấu hình',
      };
    }

    const carrierPromises = providers.map((provider) =>
      calculateShippingForCarrier(provider, { from, to, weight, value })
    );

    const results = await Promise.all(carrierPromises);

    const successfulResults = results.filter((r) => r.success);

    if (successfulResults.length === 0) {
      return {
        success: false,
        error: 'Không thể tính phí vận chuyển từ bất kỳ nhà vận chuyển nào',
        details: results,
      };
    }

    return {
      success: true,
      carriers: successfulResults,
    };
  } catch (error) {
    console.error('calculateShippingFromAllCarriers error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function calculateShippingForCarrier(provider, { from, to, weight, value }) {
  try {
    if (provider.code === 'ghn') {
      const adapter = new GHNAdapter(provider);
      return await adapter.calculateShipping({
        from,
        to,
        weight,
        value,
        provider,
      });
    }

    return {
      success: false,
      error: `Carrier ${provider.code} chưa được hỗ trợ`,
    };
  } catch (error) {
    console.error(`calculateShippingForCarrier (${provider.code}) error:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getProvinces() {
  try {
    const provinces = await Province.find({
      provider: 'ghn',
      isActive: true,
    }).select('provinceId provinceName code');

    if (provinces.length === 0) {
      return {
        success: false,
        error: 'Không có dữ liệu tỉnh/thành. Vui lòng chạy location seeder trước.',
      };
    }

    const formattedProvinces = provinces.map((p) => ({
      ProvinceID: p.provinceId,
      ProvinceName: p.provinceName,
      Code: p.code,
    }));

    return {
      success: true,
      provinces: formattedProvinces,
    };
  } catch (error) {
    console.error('getProvinces error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getDistricts(provinceId) {
  try {
    const districts = await District.find({
      provider: 'ghn',
      provinceId,
      isActive: true,
    }).select('districtId districtName code');

    if (districts.length === 0) {
      return {
        success: false,
        error: `Không có quận/huyện nào trong tỉnh ID ${provinceId}`,
      };
    }

    const formattedDistricts = districts.map((d) => ({
      DistrictID: d.districtId,
      DistrictName: d.districtName,
      Code: d.code,
    }));

    return {
      success: true,
      districts: formattedDistricts,
    };
  } catch (error) {
    console.error('getDistricts error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getWards(districtId) {
  try {
    const wards = await Ward.find({
      provider: 'ghn',
      districtId,
      isActive: true,
    }).select('wardCode wardName');

    if (wards.length === 0) {
      return {
        success: false,
        error: `Không có phường/xã nào trong quận ID ${districtId}`,
      };
    }

    const formattedWards = wards.map((w) => ({
      WardCode: w.wardCode,
      WardName: w.wardName,
    }));

    return {
      success: true,
      wards: formattedWards,
    };
  } catch (error) {
    console.error('getWards error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  getActiveProviders,
  calculateShippingFromAllCarriers,
  calculateShippingForCarrier,
  getProvinces,
  getDistricts,
  getWards,
};
