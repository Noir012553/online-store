/**
 * Migration Script - Fix category names from translation keys to actual names
 * 
 * Vấn đề: Các danh mục hiện tại có name = 'category_headphones' thay vì 'Headphones'
 * Giải pháp: Update tất cả danh mục với tên tiếng Anh chính xác
 * 
 * Usage: NODE_ENV=development MONGO_URI=... node src/scripts/fixCategoryNames.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

const CATEGORY_NAME_FIXES = {
  'category_keyboard': 'Keyboard',
  'category_mouse': 'Mouse',
  'category_headphones': 'Headphones',
  'category_cooling': 'Cooling',
  'category_gaming_laptop': 'Gaming Laptop',
  'category_office_laptop': 'Office Laptop',
};

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI not set in environment variables');
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log('\n📝 Fixing category names...\n');

    let updated = 0;
    let failed = 0;

    for (const [oldName, newName] of Object.entries(CATEGORY_NAME_FIXES)) {
      try {
        const result = await Category.findOneAndUpdate(
          { name: oldName, isDeleted: false },
          { name: newName },
          { new: true }
        );

        if (result) {
          console.log(`✅ ${oldName} → ${newName}`);
          updated++;
        } else {
          console.log(`⏭️  ${oldName} not found (already fixed or doesn't exist)`);
        }
      } catch (error) {
        console.error(`❌ Failed to update ${oldName}:`, error.message);
        failed++;
      }
    }

    // Verify all categories
    const allCategories = await Category.find({ isDeleted: false }).select('name translationKey');
    
    console.log(`\n✅ Migration complete: ${updated} updated, ${failed} failed\n`);
    console.log('📋 Current categories:');
    allCategories.forEach(cat => {
      console.log(`  - ${cat.name} (translationKey: ${cat.translationKey})`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
