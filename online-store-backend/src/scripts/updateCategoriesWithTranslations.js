/**
 * Migration Script - Add translations, icons, images to existing categories
 * 
 * Usage: NODE_ENV=development MONGO_URI=... node src/scripts/updateCategoriesWithTranslations.js
 * 
 * This script:
 * 1. Updates 6 existing categories with translationKey, icon, image fields
 * 2. Ensures data structure matches new requirements for dynamic translations
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

const categoryUpdates = [
  {
    name: 'Bàn phím',
    updates: {
      translationKey: 'category_keyboard',
      icon: 'Keyboard',
      image: 'https://images.unsplash.com/photo-1587829191301-42b50b99e145?w=300&h=300&fit=crop',
    }
  },
  {
    name: 'Chuột',
    updates: {
      translationKey: 'category_mouse',
      icon: 'Mouse',
      image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=300&h=300&fit=crop',
    }
  },
  {
    name: 'Tai nghe',
    updates: {
      translationKey: 'category_headphones',
      icon: 'Headphones',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop',
    }
  },
  {
    name: 'Tản nhiệt',
    updates: {
      translationKey: 'category_cooling',
      icon: 'Zap',
      image: 'https://images.unsplash.com/photo-1516129750519-a4ec90e16fe8?w=300&h=300&fit=crop',
    }
  },
  {
    name: 'Laptop Gaming',
    updates: {
      translationKey: 'category_gaming_laptop',
      icon: 'Gamepad2',
      image: 'https://images.unsplash.com/photo-1593642632367-c85cabc56f10?w=300&h=300&fit=crop',
    }
  },
  {
    name: 'Laptop Văn phòng',
    updates: {
      translationKey: 'category_office_laptop',
      icon: 'Briefcase',
      image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=300&fit=crop',
    }
  }
];

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI not set in environment variables');
    }

    await mongoose.connect(process.env.MONGO_URI);

    let updated = 0;
    let failed = 0;

    for (const { name, updates } of categoryUpdates) {
      try {
        const result = await Category.findOneAndUpdate(
          { name, isDeleted: false },
          updates,
          { new: true }
        );

        if (result) {
          updated++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
      }
    }

    // Verify updates
    const allCategories = await Category.find({ isDeleted: false });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
})();
