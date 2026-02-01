const Address = require('../models/Address');
const Customer = require('../models/Customer');
const { Province, District, Ward } = require('../models/Location');

const seedAddresses = async () => {
  try {
    console.log('\n📍 Starting address seeding from Location database...\n');

    await Address.deleteMany({});
    console.log('🗑️  Old addresses cleared\n');

    const customers = await Customer.find({ isDeleted: false });
    if (customers.length === 0) {
      console.warn('⚠️ No customers found. Please seed customers first!');
      return [];
    }
    console.log(`✅ Found ${customers.length} customers\n`);

    const provinces = await Province.find({ provider: 'ghn', isActive: true });
    if (provinces.length === 0) {
      throw new Error('No provinces found in Location model. Please run location seeder first! Run: npm run seed');
    }
    console.log(`✅ Found ${provinces.length} provinces from Location model\n`);

    const addresses = [];
    const streets = ['Nguyễn Huệ', 'Lê Lợi', 'Trần Hưng Đạo', 'Lý Tự Trọng', 'Đông Khới', 'Phạm Ngũ Lão', 'Đinh Tiên Hoàng', 'Bà Triệu'];

    for (let customerIndex = 0; customerIndex < customers.length; customerIndex++) {
      const customer = customers[customerIndex];
      const province = provinces[customerIndex % provinces.length];

      const districts = await District.find({
        provider: 'ghn',
        provinceId: province.provinceId,
        isActive: true,
      }).limit(5);

      if (districts.length === 0) {
        console.warn(`⚠️  No districts found for province ${province.provinceName}, skipping...`);
        continue;
      }

      const district = districts[customerIndex % districts.length];
      const wards = await Ward.find({
        provider: 'ghn',
        districtId: district.districtId,
        isActive: true,
      }).limit(5);

      if (wards.length === 0) {
        console.warn(`⚠️  No wards found for district ${district.districtName}, skipping...`);
        continue;
      }

      const ward = wards[customerIndex % wards.length];
      const street = streets[customerIndex % streets.length];

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

      if (customerIndex % 2 === 1) {
        const officeDistrict = districts[(customerIndex + 1) % districts.length];
        const officeWards = await Ward.find({
          provider: 'ghn',
          districtId: officeDistrict.districtId,
          isActive: true,
        }).limit(5);

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

    if (addresses.length === 0) {
      throw new Error('No addresses could be created. Check Location data.');
    }

    const createdAddresses = await Address.create(addresses);
    console.log('\n═══════════════════════════════════════════');
    console.log('✅ Address Seeding Complete!');
    console.log('═══════════════════════════════════════════');
    console.log(`📦 Total addresses created: ${createdAddresses.length}`);
    console.log(`👥 For customers: ${customers.length}`);
    console.log('═══════════════════════════════════════════\n');

    return createdAddresses;
  } catch (error) {
    console.error('❌ Address seeding failed:', error.message);
    throw error;
  }
};

module.exports = seedAddresses;
