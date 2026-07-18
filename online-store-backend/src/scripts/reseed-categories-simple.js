#!/usr/bin/env node

/**
 * Đồng bộ category canonical mà không xóa hoặc thay thế các bản ghi hiện có.
 * Chạy: node src/scripts/reseed-categories-simple.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');
const CategoryFactory = require('../factories/categoryFactory');

async function syncCategories() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store');

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

    const syncedCategories = await Category.find({
      key: { $in: categories.map(category => category.key) },
      isDeleted: false,
    }).lean();

    console.log(`Synced ${syncedCategories.length} canonical categories without replacing IDs.`);
  } catch (error) {
    console.error('Category sync failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

syncCategories();
