const Address = require('../models/Address');
const Customer = require('../models/Customer');
const { Province, District, Ward } = require('../models/Location');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const seedAddresses = async () => {
  console.time(`${CLI_SYMBOLS.duration} seedAddresses - Total Time`);

  const seedLang = getDefaultLanguage().code.toUpperCase();

  try {
    await Address.deleteMany({});

    const customers = await Customer.find({ isDeleted: false });
    if (customers.length === 0) {
      console.log(`${CLI_SYMBOLS.warning} No customers found`);
      return [];
    }

    const provinces = await Province.find({ provider: 'ghn' });
    if (provinces.length === 0) {
      throw new Error(getMessage(seedLang, 'seeder-messages.no_provinces_found'));
    }
    console.log(getMessage(seedLang, 'seeder-messages.bulk_location_preload'));
    console.time(`  ${CLI_SYMBOLS.duration} Bulk location pre-load`);

    const provinceIds = provinces.map(p => p.provinceId);

    // Fetch ALL districts for ALL provinces in ONE query
    const allDistricts = await District.find({
      provider: 'ghn',
      provinceId: { $in: provinceIds },
    }).lean();

    const allWards = await Ward.find({}).lean();

    console.timeEnd(`  ${CLI_SYMBOLS.duration} Bulk location pre-load`);
    console.log(getMessage(seedLang, 'seeder-messages.locations_loaded', {
      districts: allDistricts.length,
      wards: allWards.length
    }));

    // Create lookup maps for O(1) access (province → districts, district → wards)
    const districtsByProvince = new Map();
    allDistricts.forEach(d => {
      const provinceKey = String(d.provinceId);
      if (!districtsByProvince.has(provinceKey)) {
        districtsByProvince.set(provinceKey, []);
      }
      districtsByProvince.get(provinceKey).push(d);
    });

    const wardsByDistrict = new Map();
    allWards.forEach(w => {
      const districtKey = String(w.districtId);
      if (!wardsByDistrict.has(districtKey)) {
        wardsByDistrict.set(districtKey, []);
      }
      wardsByDistrict.get(districtKey).push(w);
    });

    console.log(getMessage(seedLang, 'seeder-messages.generating_addresses'));
    console.time(`  ${CLI_SYMBOLS.duration} Address generation`);

    const addresses = [];

    for (let customerIndex = 0; customerIndex < customers.length; customerIndex++) {
      const customer = customers[customerIndex];
      const province = provinces[customerIndex % provinces.length];

      // Use pre-loaded districts (O(1) map lookup instead of DB query)
      const districts = districtsByProvince.get(String(province.provinceId)) || [];
      if (districts.length === 0) {
        continue;
      }

      const district = districts[customerIndex % districts.length];

      // Use pre-loaded wards (O(1) map lookup instead of DB query)
      const wards = wardsByDistrict.get(String(district.districtId)) || [];
      if (wards.length === 0) {
        continue;
      }

      const ward = wards[customerIndex % wards.length];

      // Home address - Only seed GHN data, customer fills street details later
      addresses.push({
        customer: customer._id,
        fullName: customer.name,
        phone: customer.phone,
        provinceId: province.provinceId,
        provinceName: province.provinceName,
        districtId: district.districtId,
        districtName: district.districtName,
        wardId: ward.wardId,
        wardName: ward.wardName,
        street: null,
        addressType: 'home',
        isDefault: true,
        isDeleted: false,
      });

      // Office address (for every 2nd customer)
      if (customerIndex % 2 === 1) {
        const officeDistrict = districts[(customerIndex + 1) % districts.length];
        const officeWards = wardsByDistrict.get(String(officeDistrict.districtId)) || [];

        if (officeWards.length > 0) {
          const officeWard = officeWards[customerIndex % officeWards.length];
          addresses.push({
            customer: customer._id,
            fullName: `${customer.name} (Office)`,
            phone: customer.phone,
            provinceId: province.provinceId,
            provinceName: province.provinceName,
            districtId: officeDistrict.districtId,
            districtName: officeDistrict.districtName,
            wardId: officeWard.wardId,
            wardName: officeWard.wardName,
            street: null,
            addressType: 'office',
            isDefault: false,
            isDeleted: false,
          });
        }
      }
    }

    console.timeEnd(`  ${CLI_SYMBOLS.duration} Address generation`);
    console.log(`${CLI_SYMBOLS.success} Generated ${addresses.length} addresses from RAM`);

    if (addresses.length === 0) {
      throw new Error('No addresses could be created. Check Location data.');
    }

    console.log(getMessage(seedLang, 'seeder-messages.bulk_inserting_addresses'));
    console.time(`  ${CLI_SYMBOLS.duration} Bulk insert`);

    const createdAddresses = await Address.insertMany(addresses, { ordered: false });

    console.timeEnd(`  ${CLI_SYMBOLS.duration} Bulk insert`);
    console.timeEnd(`${CLI_SYMBOLS.duration} seedAddresses - Total Time`);

    console.log(getMessage(seedLang, 'seeder-messages.address_seeding_complete', {
      count: createdAddresses.length,
      queries: customers.length * 2
    }));

    return createdAddresses;
  } catch (error) {
    console.error(getMessage(seedLang, 'seeder-messages.error_in_seed_addresses', {
      error: error.message
    }));
    throw error;
  }
};

module.exports = seedAddresses;
