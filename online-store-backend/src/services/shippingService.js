const ShippingProvider = require('../models/ShippingProvider');
const { Province, District, Ward } = require('../models/Location');
const ghnService = require('./ghnService');
const { GHNAdapter } = require('../adapters/carrierAdapters');
const { getDefaultLanguage } = require('../config/languageInventory');

const createShippingError = (errorCode) => {
  const error = new Error(errorCode);
  error.errorCode = errorCode;
  return error;
};

async function calculateSelectedShipping({ providerCode, serviceType, from, to, weight, value, lang }) {
  const provider = await ShippingProvider.findOne({
    code: providerCode,
    isActive: true,
    isDeleted: false,
  }).select('+apiKey');

  if (!provider) {
    throw createShippingError('SHIPPING_PROVIDER_UNAVAILABLE');
  }

  const result = await calculateShippingForCarrier(provider, { from, to, weight, value, lang });
  const selectedService = result.data?.services?.find((service) => service.serviceType === serviceType);

  if (!result.success || !selectedService) {
    throw createShippingError('SHIPPING_SERVICE_UNAVAILABLE');
  }

  return selectedService.fee;
}

async function getActiveProviders() {
  try {
    const providers = await ShippingProvider.find({
      isActive: true,
      isDeleted: false,
    }).select('-apiKey');

    return providers;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('getActiveProviders error:', error.message);
    }
    throw error;
  }
}

async function calculateShippingFromAllCarriers({ from, to, weight, value, lang }) {
  try {
    const { getMessage } = require('../i18n/messages');
    const defaultLang = getDefaultLanguage().code;
    const langUpper = (lang || defaultLang).toUpperCase();

    if (!from?.districtId || !to?.districtId || !weight) {
      return {
        success: false,
        error: getMessage(langUpper, 'shipping.missingParametersService'),
      };
    }

    const providers = await getActiveProviders();

    if (providers.length === 0) {
      return {
        success: false,
        error: getMessage(langUpper, 'shipping.noProvidersConfigured'),
      };
    }

    const carrierPromises = providers.map((provider) =>
      calculateShippingForCarrier(provider, { from, to, weight, value, lang })
    );

    const results = await Promise.all(carrierPromises);

    const successfulResults = results.filter((r) => r.success);

    if (successfulResults.length === 0) {
      return {
        success: false,
        error: getMessage(langUpper, 'shipping.cannotCalculateFee'),
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

async function calculateShippingForCarrier(provider, { from, to, weight, value, lang }) {
  try {
    const { getMessage } = require('../i18n/messages');
    const defaultLang = getDefaultLanguage().code;
    const langUpper = (lang || defaultLang).toUpperCase();

    if (provider.code === 'ghn') {
      const adapter = new GHNAdapter(provider);
      return await adapter.calculateShipping({
        from,
        to,
        weight,
        value,
        provider,
        lang,
      });
    }

    return {
      success: false,
      error: getMessage(langUpper, 'shipping.unsupportedCarrier').replace('{{code}}', provider.code),
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
    if (process.env.NODE_ENV === 'development') {
      console.error('getProvinces error:', error.message);
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getDistricts(provinceId, lang) {
  try {
    const { getMessage } = require('../i18n/messages');
    const defaultLang = getDefaultLanguage().code;
    const langUpper = (lang || defaultLang).toUpperCase();
    const districts = await District.find({
      provider: 'ghn',
      provinceId,
      isActive: true,
    }).select('districtId districtName code');

    if (districts.length === 0) {
      return {
        success: false,
        error: getMessage(langUpper, 'shipping.noDistricts').replace('{{provinceId}}', provinceId),
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
    if (process.env.NODE_ENV === 'development') {
      console.error('getDistricts error:', error.message);
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getWards(districtId, lang) {
  try {
    const { getMessage } = require('../i18n/messages');
    const defaultLang = getDefaultLanguage().code;
    const langUpper = (lang || defaultLang).toUpperCase();
    const wards = await Ward.find({
      provider: 'ghn',
      districtId,
      isActive: true,
    }).select('wardCode wardName');

    const formattedWards = wards.length > 0
      ? wards.map((w) => ({
          WardCode: w.wardCode,
          WardName: w.wardName,
        }))
      : (await ghnService.getWards(districtId, langUpper)).map((ward) => ({
          WardCode: ward.WardCode,
          WardName: ward.WardName,
        }));

    if (formattedWards.length === 0) {
      return {
        success: false,
        error: getMessage(langUpper, 'shipping.noWards').replace('{{districtId}}', districtId),
      };
    }

    return {
      success: true,
      wards: formattedWards,
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('getWards error:', error.message);
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  calculateSelectedShipping,
  getActiveProviders,
  calculateShippingFromAllCarriers,
  calculateShippingForCarrier,
  getProvinces,
  getDistricts,
  getWards,
};
