const asyncHandler = require('express-async-handler');
const ShippingProvider = require('../models/ShippingProvider');
const Currency = require('../models/Currency');
const { Province, District, Ward } = require('../models/Location');
const ghnService = require('../services/ghnService');
const { getMessage } = require('../i18n/messages');
const { getActiveLangCodes, getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const getShippingProviders = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;
  const defaultLang = getDefaultLanguage();
  const requestedLang = (req.query.lang || defaultLang.code).toLowerCase();
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang.code;
  const keyword = req.query.keyword
    ? {
        name: { $regex: req.query.keyword, $options: 'i' },
      }
    : {};

  const count = await ShippingProvider.countDocuments({ ...keyword, isDeleted: false });
  let providers = await ShippingProvider.find({ ...keyword, isDeleted: false })
    .select('-apiKey')
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  // Overlay shipping service names based on lang (Rule #2: Dynamic Data with locale)
  const activeLangs = getActiveLangCodes();
  providers = providers.map(provider => {
    const providerObj = provider.toObject ? provider.toObject() : provider;
    const langUpper = lang.toUpperCase();
    return {
      ...providerObj,
      serviceTypes: providerObj.serviceTypes.map(service => {
        const serviceObj = service.toObject ? service.toObject() : service;
        const serviceName = typeof serviceObj.name === 'object' && serviceObj.name
          ? (
            serviceObj.name[langUpper] ||
            serviceObj.name[lang.toLowerCase()] ||
            serviceObj.name[defaultLang.code.toUpperCase()] ||
            serviceObj.name[defaultLang.code.toLowerCase()] ||
            ''
          )
          : (typeof serviceObj.name === 'string' ? serviceObj.name : '');
        return {
          ...serviceObj,
          name: serviceName,
        };
      }),
    };
  });

  res.json({
    providers,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

const getShippingProviderById = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const requestedLang = (req.query.lang || defaultLang.code).toLowerCase();
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang.code;

  let provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).select('-apiKey');

  if (!provider) {
    return res.status(404).json({ message: getMessage(req.lang, 'admin-controllers-messages.shipping_provider_not_found') });
  }

  // Overlay shipping service names based on lang (Rule #2: Dynamic Data with locale)
  const providerObj = provider.toObject ? provider.toObject() : provider;
  const langUpper = lang.toUpperCase();
  provider = {
    ...providerObj,
    serviceTypes: providerObj.serviceTypes.map(service => {
      const serviceObj = service.toObject ? service.toObject() : service;
      const serviceName = typeof serviceObj.name === 'object' && serviceObj.name
        ? (
          serviceObj.name[langUpper] ||
          serviceObj.name[lang.toLowerCase()] ||
          serviceObj.name[defaultLang.code.toUpperCase()] ||
          serviceObj.name[defaultLang.code.toLowerCase()] ||
          Object.values(serviceObj.name).find(v => v) ||
          ''
        )
        : (typeof serviceObj.name === 'string' ? serviceObj.name : '');
      return {
        ...serviceObj,
        name: serviceName,
      };
    }),
  };

  res.json(provider);
});

const createShippingProvider = asyncHandler(async (req, res) => {
  const { name, code, apiUrl, apiKey, serviceTypes, logo, description, currencyCode } = req.body;

  if (!name || !code || !apiUrl || !apiKey || !currencyCode) {
    return res.status(400).json({
      message: getMessage(req.lang, 'admin-controllers-messages.provider_fields_required'),
    });
  }

  const providerCurrency = await Currency.findOne({
    code: currencyCode.toUpperCase(),
    isActive: true,
  });

  if (!providerCurrency) {
    return res.status(400).json({ message: 'Shipping provider currency must be active' });
  }

  const existingProvider = await ShippingProvider.findOne({
    code: code.toLowerCase(),
    isDeleted: false,
  });

  if (existingProvider) {
    return res.status(400).json({
      message: getMessage(req.lang, 'admin-controllers-messages.provider_code_exists', { code }),
    });
  }

  const provider = new ShippingProvider({
    name,
    code: code.toLowerCase(),
    apiUrl,
    apiKey,
    currencyCode: currencyCode.toUpperCase(),
    serviceTypes: serviceTypes || getDefaultServiceTypes(code),
    logo: logo || null,
    description: description || null,
  });

  const savedProvider = await provider.save();

  const response = savedProvider.toObject();
  delete response.apiKey;

  res.status(201).json({
    message: getMessage(req.lang, 'admin-controllers-messages.provider_created_success'),
    provider: response,
  });
});

const updateShippingProvider = asyncHandler(async (req, res) => {
  const { name, description, logo, serviceTypes, apiKey, isActive, currencyCode } = req.body;

  const provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!provider) {
    return res.status(404).json({ message: getMessage(req.lang, 'admin-controllers-messages.shipping_provider_not_found') });
  }

  if (name) provider.name = name;
  if (description !== undefined) provider.description = description;
  if (logo !== undefined) provider.logo = logo;
  if (serviceTypes) provider.serviceTypes = serviceTypes;
  if (apiKey) provider.apiKey = apiKey;
  if (typeof isActive === 'boolean') provider.isActive = isActive;
  if (currencyCode) {
    const providerCurrency = await Currency.findOne({
      code: currencyCode.toUpperCase(),
      isActive: true,
    });
    if (!providerCurrency) {
      return res.status(400).json({ message: 'Shipping provider currency must be active' });
    }
    provider.currencyCode = currencyCode.toUpperCase();
  }

  const updatedProvider = await provider.save();

  const response = updatedProvider.toObject();
  delete response.apiKey;

  res.json({
    message: getMessage(req.lang, 'admin-controllers-messages.provider_updated_success'),
    provider: response,
  });
});

const toggleProviderStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  const provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!provider) {
    return res.status(404).json({ message: getMessage(req.lang, 'admin-controllers-messages.shipping_provider_not_found') });
  }

  if (typeof isActive === 'boolean') {
    provider.isActive = isActive;
  } else {
    provider.isActive = !provider.isActive;
  }

  const updatedProvider = await provider.save();

  const response = updatedProvider.toObject();
  delete response.apiKey;

  const status = updatedProvider.isActive ? 'activated' : 'deactivated';
  res.json({
    message: getMessage(req.lang, 'admin-controllers-messages.provider_activated_deactivated', { status }),
    provider: response,
  });
});

const deleteShippingProvider = asyncHandler(async (req, res) => {
  const provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!provider) {
    return res.status(404).json({ message: getMessage(req.lang, 'admin-controllers-messages.shipping_provider_not_found') });
  }

  provider.isDeleted = true;
  await provider.save();

  res.json({ message: getMessage(req.lang, 'admin-controllers-messages.provider_deleted_success') });
});

const getDeletedProviders = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;

  const count = await ShippingProvider.countDocuments({ isDeleted: true });
  const providers = await ShippingProvider.find({ isDeleted: true })
    .select('-apiKey')
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({
    providers,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

const restoreProvider = asyncHandler(async (req, res) => {
  const provider = await ShippingProvider.findById(req.params.id);

  if (!provider) {
    return res.status(404).json({ message: getMessage(req.lang, 'admin-controllers-messages.shipping_provider_not_found') });
  }

  if (!provider.isDeleted) {
    return res.status(400).json({ message: getMessage(req.lang, 'admin-controllers-messages.provider_not_deleted') });
  }

  provider.isDeleted = false;
  await provider.save();

  const response = provider.toObject();
  delete response.apiKey;

  res.json({
    message: getMessage(req.lang, 'admin-controllers-messages.provider_restored_success'),
    provider: response,
  });
});

function getDefaultServiceTypes(code) {
  const buildServiceName = (serviceType) => {
    const names = {};
    const activeLangs = getActiveLangCodes();

    const messageKeys = {
      standard: 'shipping-providers-messages.service_standard',
      fast: 'shipping-providers-messages.service_fast',
      express: 'shipping-providers-messages.service_express',
    };

    activeLangs.forEach(lang => {
      names[lang] = getMessage(lang, messageKeys[serviceType] || 'shipping-providers-messages.service_standard');
    });

    return names;
  };

  const defaults = {
    ghn: [
      { code: 'standard', name: buildServiceName('standard'), estimatedDays: '2-3' },
      { code: 'fast', name: buildServiceName('fast'), estimatedDays: '1-2' },
      { code: 'express', name: buildServiceName('express'), estimatedDays: '1-3' },
    ],
  };

  return defaults[code.toLowerCase()] || [
    { code: 'standard', name: buildServiceName('standard'), estimatedDays: '2-3' },
  ];
}

/**
 * Admin endpoint để sync location data từ GHN API
 * @route POST /api/shipping-providers/admin/sync-locations
 * @access Admin only
 */
const syncLocationData = asyncHandler(async (req, res) => {

  try {
    // Fetch provinces from GHN API
    const provinces = await ghnService.getProvinces();
    if (!provinces || provinces.length === 0) {
      throw new Error('No provinces fetched from GHN API');
    }

    // Clear old provinces
    await Province.deleteMany({ provider: 'ghn' });

    // Save new provinces
    let provinceCount = 0;
    const provinceDocs = provinces.map((p) => ({
      provider: 'ghn',
      provinceId: p.ProvinceID,
      provinceName: p.ProvinceName,
      code: p.ProvinceID.toString(),
      isActive: true,
    }));
    await Province.insertMany(provinceDocs);
    provinceCount = provinceDocs.length;

    // Fetch all districts, collect docs, then batch insert once.
    // BEFORE: Loop N provinces × 1 insertMany = N DB operations
    // AFTER: Fetch N in parallel → collect → 1 insertMany = 1 DB operation
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.progress} [Step 1/3] Fetching districts for all provinces...`);
      console.time(`  ${CLI_SYMBOLS.duration} Bulk fetch & insert districts`);
    }

    let totalDistricts = 0;
    const allDistrictDocs = [];
    const districtFetchPromises = provinces.map(async (province) => {
      try {
        const districts = await ghnService.getDistricts(province.ProvinceID);
        if (districts && districts.length > 0) {
          const districtDocs = districts.map((d) => ({
            provider: 'ghn',
            provinceId: province.ProvinceID,
            districtId: d.DistrictID,
            districtName: d.DistrictName,
            code: d.DistrictID.toString(),
            isActive: true,
          }));
          return districtDocs;
        }
        return [];
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`${CLI_SYMBOLS.warning} Failed to fetch districts for province ${province.ProvinceID}: ${err.message}`);
        }
        return [];
      }
    });

    // Wait for ALL district fetches in parallel
    const districtBatches = await Promise.all(districtFetchPromises);
    districtBatches.forEach(batch => allDistrictDocs.push(...batch));

    // Bulk insert all districts at once
    if (allDistrictDocs.length > 0) {
      await District.insertMany(allDistrictDocs, { ordered: false });
      totalDistricts = allDistrictDocs.length;
      if (process.env.NODE_ENV === 'development') {
        console.log(`${CLI_SYMBOLS.success} Inserted ${totalDistricts} districts in 1 operation`);
      }
    }
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`  ${CLI_SYMBOLS.duration} Bulk fetch & insert districts`);
    }

    // Fetch all wards, collect docs, then batch insert once.
    // BEFORE: Loop M districts × 1 insertMany = M DB operations
    // AFTER: Fetch M in parallel → collect → 1 insertMany = 1 DB operation
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.progress} [Step 2/3] Fetching wards for all districts...`);
      console.time('  ⏱️ Bulk fetch & insert wards');
    }

    let totalWards = 0;
    const districtData = await District.find({ provider: 'ghn' }).lean();

    const allWardDocs = [];
    const wardFetchPromises = districtData.map(async (district) => {
      try {
        const wards = await ghnService.getWards(district.districtId);
        if (wards && wards.length > 0) {
          const wardDocs = wards.map((w) => ({
            provider: 'ghn',
            districtId: district.districtId,
            wardCode: w.WardCode,
            wardName: w.WardName,
            isActive: true,
          }));
          return wardDocs;
        }
        return [];
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`${CLI_SYMBOLS.warning} Failed to fetch wards for district ${district.districtId}: ${err.message}`);
        }
        return [];
      }
    });

    // Wait for ALL ward fetches in parallel
    const wardBatches = await Promise.all(wardFetchPromises);
    wardBatches.forEach(batch => allWardDocs.push(...batch));

    // Bulk insert all wards at once
    if (allWardDocs.length > 0) {
      await Ward.insertMany(allWardDocs, { ordered: false });
      totalWards = allWardDocs.length;
      if (process.env.NODE_ENV === 'development') {
        console.log(`${CLI_SYMBOLS.success} Inserted ${totalWards} wards in 1 operation`);
      }
    }
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd('  ⏱️ Bulk fetch & insert wards');
      console.log(`\n${CLI_SYMBOLS.chart} LOCATION SYNC COMPLETE:\n   ${CLI_SYMBOLS.bullet} Provinces: ${provinceCount}\n   ${CLI_SYMBOLS.bullet} Districts: ${totalDistricts}\n   ${CLI_SYMBOLS.bullet} Wards: ${totalWards}`);
    }

    res.json({
      success: true,
      message: 'Location data synced successfully',
      data: {
        provinces: provinceCount,
        districts: totalDistricts,
        wards: totalWards,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = {
  getShippingProviders,
  getShippingProviderById,
  createShippingProvider,
  updateShippingProvider,
  toggleProviderStatus,
  deleteShippingProvider,
  getDeletedProviders,
  restoreProvider,
  syncLocationData,
};
