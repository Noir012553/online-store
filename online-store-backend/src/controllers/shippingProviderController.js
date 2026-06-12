const asyncHandler = require('express-async-handler');
const ShippingProvider = require('../models/ShippingProvider');
const { Province, District, Ward } = require('../models/Location');
const ghnService = require('../services/ghnService');

const getShippingProviders = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        name: { $regex: req.query.keyword, $options: 'i' },
      }
    : {};

  const count = await ShippingProvider.countDocuments({ ...keyword, isDeleted: false });
  const providers = await ShippingProvider.find({ ...keyword, isDeleted: false })
    .select('-apiKey')
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({
    providers,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

const getShippingProviderById = asyncHandler(async (req, res) => {
  const provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).select('-apiKey');

  if (!provider) {
    return res.status(404).json({ message: 'Nhà vận chuyển không tồn tại' });
  }

  res.json(provider);
});

const createShippingProvider = asyncHandler(async (req, res) => {
  const { name, code, apiUrl, apiKey, serviceTypes, logo, description } = req.body;

  if (!name || !code || !apiUrl || !apiKey) {
    return res.status(400).json({
      message: 'Vui lòng cung cấp: name, code, apiUrl, apiKey',
    });
  }

  const existingProvider = await ShippingProvider.findOne({
    code: code.toLowerCase(),
    isDeleted: false,
  });

  if (existingProvider) {
    return res.status(400).json({
      message: `Nhà vận chuyển với code "${code}" đã tồn tại`,
    });
  }

  const provider = new ShippingProvider({
    name,
    code: code.toLowerCase(),
    apiUrl,
    apiKey,
    serviceTypes: serviceTypes || getDefaultServiceTypes(code),
    logo: logo || null,
    description: description || null,
  });

  const savedProvider = await provider.save();

  const response = savedProvider.toObject();
  delete response.apiKey;

  res.status(201).json({
    message: 'Nhà vận chuyển được tạo thành công',
    provider: response,
  });
});

const updateShippingProvider = asyncHandler(async (req, res) => {
  const { name, description, logo, serviceTypes, apiKey, isActive } = req.body;

  const provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!provider) {
    return res.status(404).json({ message: 'Nhà vận chuyển không tồn tại' });
  }

  if (name) provider.name = name;
  if (description !== undefined) provider.description = description;
  if (logo !== undefined) provider.logo = logo;
  if (serviceTypes) provider.serviceTypes = serviceTypes;
  if (apiKey) provider.apiKey = apiKey;
  if (typeof isActive === 'boolean') provider.isActive = isActive;

  const updatedProvider = await provider.save();

  const response = updatedProvider.toObject();
  delete response.apiKey;

  res.json({
    message: 'Nhà vận chuyển được cập nhật thành công',
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
    return res.status(404).json({ message: 'Nhà vận chuyển không tồn tại' });
  }

  if (typeof isActive === 'boolean') {
    provider.isActive = isActive;
  } else {
    provider.isActive = !provider.isActive;
  }

  const updatedProvider = await provider.save();

  const response = updatedProvider.toObject();
  delete response.apiKey;

  res.json({
    message: `Nhà vận chuyển được ${updatedProvider.isActive ? 'kích hoạt' : 'vô hiệu hóa'}`,
    provider: response,
  });
});

const deleteShippingProvider = asyncHandler(async (req, res) => {
  const provider = await ShippingProvider.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!provider) {
    return res.status(404).json({ message: 'Nhà vận chuyển không tồn tại' });
  }

  provider.isDeleted = true;
  await provider.save();

  res.json({ message: 'Nhà vận chuyển được xóa thành công' });
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
    return res.status(404).json({ message: 'Nhà vận chuyển không tồn tại' });
  }

  if (!provider.isDeleted) {
    return res.status(400).json({ message: 'Nhà vận chuyển này không bị xóa' });
  }

  provider.isDeleted = false;
  await provider.save();

  const response = provider.toObject();
  delete response.apiKey;

  res.json({
    message: 'Nhà vận chuyển được khôi phục thành công',
    provider: response,
  });
});

function getDefaultServiceTypes(code) {
  const defaults = {
    ghn: [
      { code: 'standard', name: 'Giao hàng tiêu chuẩn', estimatedDays: '2-3' },
      { code: 'fast', name: 'Giao hàng nhanh', estimatedDays: '1-2' },
      { code: 'express', name: 'Giao hàng thành phố', estimatedDays: '1-3' },
    ],
  };

  return defaults[code.toLowerCase()] || [
    { code: 'standard', name: 'Tiêu chuẩn', estimatedDays: '2-3' },
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

    // 🚀 OPTIMIZATION: Fetch all districts, collect docs, then batch insert once
    // BEFORE: Loop N provinces × 1 insertMany = N DB operations
    // AFTER: Fetch N in parallel → collect → 1 insertMany = 1 DB operation
    console.log('🔄 [Step 1/3] Fetching districts for all provinces...');
    console.time('  ⏱️ Bulk fetch & insert districts');

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
        console.warn(`⚠️ Failed to fetch districts for province ${province.ProvinceID}: ${err.message}`);
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
      console.log(`✅ Inserted ${totalDistricts} districts in 1 operation`);
    }
    console.timeEnd('  ⏱️ Bulk fetch & insert districts');

    // 🚀 OPTIMIZATION: Fetch all wards, collect docs, then batch insert once
    // BEFORE: Loop M districts × 1 insertMany = M DB operations
    // AFTER: Fetch M in parallel → collect → 1 insertMany = 1 DB operation
    console.log('🔄 [Step 2/3] Fetching wards for all districts...');
    console.time('  ⏱️ Bulk fetch & insert wards');

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
        console.warn(`⚠️ Failed to fetch wards for district ${district.districtId}: ${err.message}`);
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
      console.log(`✅ Inserted ${totalWards} wards in 1 operation`);
    }
    console.timeEnd('  ⏱️ Bulk fetch & insert wards');

    console.log(`\n📈 LOCATION SYNC COMPLETE:\n   • Provinces: ${provinceCount}\n   • Districts: ${totalDistricts}\n   • Wards: ${totalWards}`);

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
