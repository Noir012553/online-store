const Address = require('../models/Address');
const Customer = require('../models/Customer');
const { Province, District, Ward } = require('../models/Location');

const seedAddresses = async () => {
  console.time('⏱️ seedAddresses - Total Time');

  try {
    await Address.deleteMany({});

    const customers = await Customer.find({ isDeleted: false });
    if (customers.length === 0) {
      console.log('⚠️ No customers found');
      return [];
    }

    const provinces = await Province.find({ provider: 'ghn', isActive: true });
    if (provinces.length === 0) {
      throw new Error('No provinces found in Location model. Please run location seeder first! Run: npm run seed');
    }

    // 🚀 OPTIMIZATION: Pre-load ALL districts and wards for ALL provinces
    // BEFORE: Loop N customers × (1 find districts + 1 find wards) = 2N queries
    // AFTER: 1 bulk query for all districts + 1 bulk query for all wards = 2 queries total
    console.log('🔄 [Step 1/3] Pre-loading all districts and wards into RAM...');
    console.time('  ⏱️ Bulk location pre-load');

    const provinceIds = provinces.map(p => p.provinceId);

    // Fetch ALL districts for ALL provinces in ONE query
    const allDistricts = await District.find({
      provider: 'ghn',
      provinceId: { $in: provinceIds },
      isActive: true,
    }).lean();

    // Fetch ALL wards for ALL districts in ONE query
    const districtIds = allDistricts.map(d => d.districtId);
    const allWards = await Ward.find({
      provider: 'ghn',
      districtId: { $in: districtIds },
      isActive: true,
    }).lean();

    console.timeEnd('  ⏱️ Bulk location pre-load');
    console.log(`✅ Loaded ${allDistricts.length} districts and ${allWards.length} wards into RAM`);

    // Create lookup maps for O(1) access (province → districts, district → wards)
    const districtsByProvince = new Map();
    allDistricts.forEach(d => {
      if (!districtsByProvince.has(d.provinceId)) {
        districtsByProvince.set(d.provinceId, []);
      }
      districtsByProvince.get(d.provinceId).push(d);
    });

    const wardsByDistrict = new Map();
    allWards.forEach(w => {
      if (!wardsByDistrict.has(w.districtId)) {
        wardsByDistrict.set(w.districtId, []);
      }
      wardsByDistrict.get(w.districtId).push(w);
    });

    // 2️⃣ Generate addresses using in-memory lookups (no DB queries)
    console.log('📝 [Step 2/3] Generating addresses from RAM lookups...');
    console.time('  ⏱️ Address generation');

    const addresses = [];
    const streets = ['Nguyễn Huệ', 'Lê Lợi', 'Trần Hưng Đạo', 'Lý Tự Trọng', 'Đông Khới', 'Phạm Ngũ Lão', 'Đinh Tiên Hoàng', 'Bà Triệu'];

    for (let customerIndex = 0; customerIndex < customers.length; customerIndex++) {
      const customer = customers[customerIndex];
      const province = provinces[customerIndex % provinces.length];

      // Use pre-loaded districts (O(1) map lookup instead of DB query)
      const districts = districtsByProvince.get(province.provinceId) || [];
      if (districts.length === 0) {
        continue;
      }

      const district = districts[customerIndex % districts.length];

      // Use pre-loaded wards (O(1) map lookup instead of DB query)
      const wards = wardsByDistrict.get(district.districtId) || [];
      if (wards.length === 0) {
        continue;
      }

      const ward = wards[customerIndex % wards.length];
      const street = streets[customerIndex % streets.length];

      // Home address
      addresses.push({
        customer: customer._id,
        fullName: customer.name,
        phone: customer.phone,
        provinceId: province.provinceId,
        provinceName: province.provinceName,
        districtId: district.districtId,
        districtName: district.districtName,
        wardId: ward.districtId,
        wardName: ward.wardName,
        street: `${100 + customerIndex} Đường ${street}`,
        addressType: 'home',
        isDefault: true,
        isDeleted: false,
      });

      // Office address (for every 2nd customer)
      if (customerIndex % 2 === 1) {
        const officeDistrict = districts[(customerIndex + 1) % districts.length];
        const officeWards = wardsByDistrict.get(officeDistrict.districtId) || [];

        if (officeWards.length > 0) {
          const officeWard = officeWards[customerIndex % officeWards.length];
          addresses.push({
            customer: customer._id,
            fullName: `${customer.name} (Công ty)`,
            phone: customer.phone,
            provinceId: province.provinceId,
            provinceName: province.provinceName,
            districtId: officeDistrict.districtId,
            districtName: officeDistrict.districtName,
            wardId: officeWard.districtId,
            wardName: officeWard.wardName,
            street: `${200 + customerIndex} Đường ${street}, Tòa nhà ABC`,
            addressType: 'office',
            isDefault: false,
            isDeleted: false,
          });
        }
      }
    }

    console.timeEnd('  ⏱️ Address generation');
    console.log(`✅ Generated ${addresses.length} addresses from RAM`);

    if (addresses.length === 0) {
      throw new Error('No addresses could be created. Check Location data.');
    }

    // 3️⃣ Bulk insert all addresses in ONE operation
    console.log('💾 [Step 3/3] Bulk inserting addresses...');
    console.time('  ⏱️ Bulk insert');

    const createdAddresses = await Address.insertMany(addresses, { ordered: false });

    console.timeEnd('  ⏱️ Bulk insert');
    console.timeEnd('⏱️ seedAddresses - Total Time');

    console.log(`\n📈 ADDRESS SEEDING COMPLETE:\n   • Addresses created: ${createdAddresses.length}\n   • DB queries reduced from ~${customers.length * 2} to 3`);

    return createdAddresses;
  } catch (error) {
    console.error('❌ Error in seedAddresses:', error.message);
    throw error;
  }
};

module.exports = seedAddresses;
