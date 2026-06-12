/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Category = require('../models/Category');
const CategoryFactory = require('../factories/categoryFactory');
const translationSeederHelper = require('../services/translationSeederHelper');

/**
 * Seed dữ liệu danh mục
 * Tạo 6 danh mục sản phẩm và dịch sang tiếng Anh
 */
const seedCategories = async () => {
  await Category.deleteMany({});

  // Drop old indexes to prevent "duplicate key error" from deprecated fields
  try {
    await Category.collection.dropIndex('translationKey_1');
  } catch (err) {
    // Index doesn't exist, that's fine
  }

  const categories = CategoryFactory.createMany(6);
  const createdCategories = await Category.create(categories);

  // Translate categories to English
  console.log('\n  🌍 Translating categories to English...');
  const categoryStats = await translationSeederHelper.translateCategoriesBatch(createdCategories, ['en']);
  console.log(`  ✅ Categories translation: ${categoryStats.total} fields (${categoryStats.translated} translated, ${categoryStats.cached} cached)`);

  return createdCategories;
};

module.exports = seedCategories;
