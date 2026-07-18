/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Customer = require('../models/Customer');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');

/**
 * Seed dữ liệu khách hàng
 * Tạo 50 khách hàng động
 */
const seedCustomers = async () => {
  await Customer.deleteMany({});

  const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Dương', 'Bùi', 'Đặng', 'Vũ', 'Tạ', 'Tô', 'Chu', 'Giang'];
  const lastNames = ['Văn', 'Thị', 'Minh', 'Quân', 'Hải', 'Tâm', 'Hùng', 'Thanh', 'Linh', 'Anh', 'Tuấn', 'Hương', 'Nhân', 'Khôi'];

  const customers = [];

  for (let i = 0; i < 50; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    const name = `${firstName} ${lastName}`;
    const email = `customer${String(i + 1).padStart(3, '0')}@example.com`;
    const phone = `090${String(i + 1).padStart(7, '0')}`;

    customers.push({
      name,
      email,
      phone,
    });
  }

  const createdCustomers = await Customer.create(customers);
  const seedLang = getDefaultLanguage().code.toUpperCase();
  console.log(getMessage(seedLang, 'seeder-messages.customers_successfully_created', {
    count: createdCustomers.length
  }));

  return createdCustomers;
};

module.exports = seedCustomers;
