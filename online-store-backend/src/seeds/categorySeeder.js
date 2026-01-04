/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Category = require('../models/Category');
const CategoryFactory = require('../factories/categoryFactory');

/**
 * Seed dữ liệu danh mục
 * Tạo 6 danh mục sản phẩm
 */
const seedCategories = async () => {
  await Category.deleteMany({});

  const categories = CategoryFactory.createMany(6);
  const createdCategories = await Category.create(categories);

  return createdCategories;
};

module.exports = seedCategories;
