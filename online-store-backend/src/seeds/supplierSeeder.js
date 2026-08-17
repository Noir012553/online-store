/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Supplier = require('../models/Supplier');
const SupplierFactory = require('../factories/supplierFactory');

/**
 * Seed dữ liệu nhà cung cấp
 * Tạo các nhà cung cấp mặc định và Tiki Trading
 */
const seedSuppliers = async () => {
  await Supplier.deleteMany({});

  const suppliers = SupplierFactory.createMany();
  const createdSuppliers = await Supplier.create(suppliers);

  return createdSuppliers;
};

module.exports = seedSuppliers;
