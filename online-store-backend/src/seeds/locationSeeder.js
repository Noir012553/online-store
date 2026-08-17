const ghnService = require('../services/ghnService');
const { Province, District, Ward } = require('../models/Location');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const PROVIDER = 'ghn';

const syncWardIndexes = async () => {
  const indexes = await Ward.collection.indexes();
  const legacyIndexes = indexes.filter(index => {
    if (index.name === '_id_' || index.unique !== true) return false;
    const key = index.key || {};
    const isExpectedUniqueIndex = key.provider === 1
      && key.districtId === 1
      && key.wardCode === 1
      && Object.keys(key).length === 3;
    return key.provider === 1
      && (key.wardCode === 1 || key.wardId === 1)
      && !isExpectedUniqueIndex;
  });

  await Promise.all(legacyIndexes.map(index => Ward.collection.dropIndex(index.name)));
  await Ward.syncIndexes();
};

const normalizeWard = (districtId, ward) => {
  const wardCode = String(ward.WardCode || ward.wardCode || '').trim();
  const wardId = Number(ward.WardID ?? ward.wardId ?? wardCode);
  const wardName = String(ward.WardName || ward.wardName || '').trim();

  if (!Number.isInteger(wardId) || !wardCode || !wardName) return null;

  return {
    provider: PROVIDER,
    districtId,
    wardId,
    wardCode,
    wardName,
    isActive: true,
  };
};

const seedLocations = async () => {
  try {
    console.log(`\n${CLI_SYMBOLS.location} Starting location data sync from GHN API...\n`);

    console.log(`${CLI_SYMBOLS.trash}  Clearing old location data...`);
    await Province.deleteMany({ provider: PROVIDER });
    await District.deleteMany({ provider: PROVIDER });
    await Ward.deleteMany({ provider: PROVIDER });
    await syncWardIndexes();
    console.log(`${CLI_SYMBOLS.success} Old data cleared\n`);

    console.log(`${CLI_SYMBOLS.download} Fetching provinces from GHN API...`);
    const provinces = await ghnService.getProvinces();
    if (!provinces || provinces.length === 0) {
      throw new Error('No provinces fetched from GHN API');
    }
    console.log(`${CLI_SYMBOLS.success} Fetched ${provinces.length} provinces\n`);

    console.log(`${CLI_SYMBOLS.save} Saving provinces to database...`);
    const provinceData = provinces.map((p) => ({
      provider: PROVIDER,
      provinceId: p.ProvinceID,
      provinceName: p.ProvinceName,
      code: p.Code || null,
      isActive: true,
    }));
    await Province.insertMany(provinceData, { ordered: false }).catch((err) => {
      if (err.code === 11000) {
        console.warn(`${CLI_SYMBOLS.warning}  Some provinces already exist, continuing...`);
        return [];
      }
      throw err;
    });
    console.log(`${CLI_SYMBOLS.success} Saved/updated ${provinces.length} provinces\n`);

    console.log(`${CLI_SYMBOLS.download} Fetching districts from GHN API...`);
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
        console.warn(`${CLI_SYMBOLS.warning}  Failed to fetch districts for province ${province.ProvinceID}: ${error.message}`);
      }
    }
    console.log(`${CLI_SYMBOLS.success} Fetched ${totalDistricts} districts\n`);

    console.log(`${CLI_SYMBOLS.save} Saving districts to database...`);
    if (allDistrictData.length > 0) {
      await District.insertMany(allDistrictData, { ordered: false }).catch((err) => {
        if (err.code === 11000) {
          console.warn(`${CLI_SYMBOLS.warning}  Some districts already exist, continuing...`);
          return [];
        }
        throw err;
      });
    }
    console.log(`${CLI_SYMBOLS.success} Saved/updated ${totalDistricts} districts\n`);

    console.log(`${CLI_SYMBOLS.download} Fetching wards from GHN API...`);
    let totalWards = 0;
    const allWardData = [];

    for (const districtData of allDistrictData) {
      try {
        const wards = await ghnService.getWards(districtData.districtId);
        if (wards && wards.length > 0) {
          const wardData = wards
            .map((ward) => normalizeWard(districtData.districtId, ward))
            .filter(Boolean);
          allWardData.push(...wardData);
          totalWards += wardData.length;
        }
      } catch (error) {
        console.warn(`${CLI_SYMBOLS.warning}  Failed to fetch wards for district ${districtData.districtId}: ${error.message}`);
      }
    }
    console.log(`${CLI_SYMBOLS.success} Fetched ${totalWards} wards\n`);

    console.log(`${CLI_SYMBOLS.save} Saving wards to database...`);
    const uniqueWardData = [...new Map(
      allWardData.map(ward => [
        `${ward.provider}:${ward.districtId}:${ward.wardCode}`,
        ward,
      ])
    ).values()];

    if (uniqueWardData.length > 0) {
      await Ward.bulkWrite(
        uniqueWardData.map(ward => ({
          updateOne: {
            filter: {
              provider: ward.provider,
              districtId: ward.districtId,
              wardCode: ward.wardCode,
            },
            update: { $set: ward },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const savedWardCount = await Ward.countDocuments({ provider: PROVIDER });
    if (savedWardCount === 0) {
      throw new Error('Ward data was fetched but no wards exist in the database');
    }
    console.log(`${CLI_SYMBOLS.success} Saved/updated ${savedWardCount} wards\n`);

    console.log(CLI_SYMBOLS.divider.repeat(43));
    console.log(`${CLI_SYMBOLS.location} Location Data Sync Complete!`);
    console.log(CLI_SYMBOLS.divider.repeat(43));
    console.log(`Provider: ${PROVIDER.toUpperCase()}`);
    console.log(`${CLI_SYMBOLS.package} Provinces: ${provinces.length}`);
    console.log(`${CLI_SYMBOLS.package} Districts: ${totalDistricts}`);
    console.log(`${CLI_SYMBOLS.package} Wards: ${savedWardCount}`);
    console.log(`${CLI_SYMBOLS.divider.repeat(43)}\n`);

    return {
      provider: PROVIDER,
      provinces: provinces.length,
      districts: totalDistricts,
      wards: savedWardCount,
    };
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Location seeding failed:`, error.message);
    throw error;
  }
};

module.exports = seedLocations;
