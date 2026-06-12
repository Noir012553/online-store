/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Customer = require('../models/Customer');

/**
 * Seed dữ liệu khách hàng
 * Tạo 30 khách hàng động
 */
const seedCustomers = async () => {
  await Customer.deleteMany({});

  const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Dương', 'Bùi', 'Đặng', 'Vũ'];
  const lastNames = ['Văn', 'Thị', 'Minh', 'Quân', 'Hải', 'Tâm', 'Hùng', 'Thanh', 'Linh', 'Anh'];
  const cities = ['Hà Nội', 'TP HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế', 'Bắc Ninh', 'Hải Dương'];
  const streets = ['Nguyễn Huệ', 'Lê Lợi', 'Trần Hưng Đạo', 'Lý Tự Trọng', 'Đông Khới', 'Phạm Ngũ Lão', 'Đinh Tiên Hoàng', 'Bà Triệu'];

  const customers = [];

  for (let i = 0; i < 30; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    const name = `${firstName} ${lastName}`;
    const email = `customer${i + 1}@example.com`;
    const phone = `090${String(i + 1).padStart(7, '0')}`;
    const street = streets[i % streets.length];
    const city = cities[i % cities.length];
    const address = `${100 + i} Đường ${street}, ${city}`;

    customers.push({
      name,
      email,
      phone,
      address,
    });
  }

  const createdCustomers = await Customer.create(customers);
  console.log(`👥 ✅ Successfully created ${createdCustomers.length} customers`);

  return createdCustomers;
};

module.exports = seedCustomers;
