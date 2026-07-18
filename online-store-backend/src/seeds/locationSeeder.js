const ghnService = require('../services/ghnService');
const { Province, District, Ward } = require('../models/Location');

const PROVIDER = 'ghn';

const seedLocations = async () => {
  try {
    console.log('\n📍 Starting location data sync from GHN API...\n');

    console.log('🗑️  Clearing old location data...');
    await Province.deleteMany({ provider: PROVIDER });
    await District.deleteMany({ provider: PROVIDER });
    await Ward.deleteMany({ provider: PROVIDER });
    console.log('✅ Old data cleared\n');

    console.log('📥 Fetching provinces from GHN API...');
    const provinces = await ghnService.getProvinces();
    if (!provinces || provinces.length === 0) {
      throw new Error('No provinces fetched from GHN API');
    }
    console.log(`✅ Fetched ${provinces.length} provinces\n`);

    console.log('💾 Saving provinces to database...');
    const provinceData = provinces.map((p) => ({
      provider: PROVIDER,
      provinceId: p.ProvinceID,
      provinceName: p.ProvinceName,
      code: p.Code || null,
      isActive: true,
    }));
    await Province.insertMany(provinceData, { ordered: false }).catch((err) => {
      if (err.code === 11000) {
        console.warn('⚠️  Some provinces already exist, continuing...');
        return [];
      }
      throw err;
    });
    console.log(`✅ Saved/updated ${provinces.length} provinces\n`);

    console.log('📥 Fetching districts from GHN API...');
    let totalDistricts = 0;
    const allDistrictData = [];

    for (const province of provinces) {
      try {
        const districts = await ghnService.getDistricts(province.ProvinceID);
        if (districts && districts.length > 0) {
          const districtData = districts.map((d) => ({
            provider: PROVIDER,
            provinceId: province.ProvinceID,
            districtId: d.DistrictID,
            districtName: d.DistrictName,
            code: d.Code || null,
            isActive: true,
          }));
          allDistrictData.push(...districtData);
          totalDistricts += districts.length;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to fetch districts for province ${province.ProvinceID}: ${error.message}`);
      }
    }
    console.log(`✅ Fetched ${totalDistricts} districts\n`);

    console.log('💾 Saving districts to database...');
    if (allDistrictData.length > 0) {
      await District.insertMany(allDistrictData, { ordered: false }).catch((err) => {
        if (err.code === 11000) {
          console.warn('⚠️  Some districts already exist, continuing...');
          return [];
        }
        throw err;
      });
    }
    console.log(`✅ Saved/updated ${totalDistricts} districts\n`);

    console.log('📥 Fetching wards from GHN API...');
    let totalWards = 0;
    const allWardData = [];

    for (const districtData of allDistrictData) {
      try {
        const wards = await ghnService.getWards(districtData.districtId);
        if (wards && wards.length > 0) {
          const wardData = wards.map((w) => ({
            provider: PROVIDER,
            districtId: districtData.districtId,
            wardId: w.WardID,
            wardCode: w.WardCode,
            wardName: w.WardName,
            isActive: true,
          }));
          allWardData.push(...wardData);
          totalWards += wards.length;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to fetch wards for district ${districtData.districtId}: ${error.message}`);
      }
    }
    console.log(`✅ Fetched ${totalWards} wards\n`);

    console.log('💾 Saving wards to database...');
    if (allWardData.length > 0) {
      await Ward.insertMany(allWardData, { ordered: false }).catch((err) => {
        if (err.code === 11000) {
          console.warn('⚠️  Some wards already exist, continuing...');
          return [];
        }
        throw err;
      });
    }
    console.log(`✅ Saved/updated ${totalWards} wards\n`);

    console.log('═══════════════════════════════════════════');
    console.log('📍 Location Data Sync Complete!');
    console.log('═══════════════════════════════════════════');
    console.log(`Provider: ${PROVIDER.toUpperCase()}`);
    console.log(`📦 Provinces: ${provinces.length}`);
    console.log(`📦 Districts: ${totalDistricts}`);
    console.log(`📦 Wards: ${totalWards}`);
    console.log('═══════════════════════════════════════════\n');

    return {
      provider: PROVIDER,
      provinces: provinces.length,
      districts: totalDistricts,
      wards: totalWards,
    };
  } catch (error) {
    console.error('❌ Location seeding failed:', error.message);
    throw error;
  }
};

module.exports = seedLocations;
