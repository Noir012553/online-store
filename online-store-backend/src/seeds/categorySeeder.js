/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Category = require('../models/Category');
const CategoryFactory = require('../factories/categoryFactory');

/**
 * Seed dữ liệu danh mục
 * Tạo 6 danh mục sản phẩm và dịch sang tiếng Anh
 */
const seedCategories = async () => {
  const categories = CategoryFactory.createMany(6);

  await Category.bulkWrite(
    categories.map(category => ({
      updateOne: {
        filter: { key: category.key },
        update: { $set: { ...category, isDeleted: false } },
        upsert: true,
      },
    }))
  );

  const createdCategories = await Category.find({
    key: { $in: categories.map(category => category.key) },
    isDeleted: false,
  }).lean();

  return categories.map(category =>
    createdCategories.find(createdCategory => createdCategory.key === category.key)
  );
};

module.exports = seedCategories;
