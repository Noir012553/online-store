#!/usr/bin/env node

/**
 * Quick script để xoá categories collection và seed lại
 * Chạy: node reseed-categories.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');
const CategoryFactory = require('../factories/categoryFactory');

async function reseedCategories() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store');
    console.log('✅ Connected to MongoDB');

    console.log('\n📝 Upserting canonical categories...');
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
    console.log(`✅ Upserted ${createdCategories.length} canonical categories`);

    console.log('\n📋 Created categories:');
    createdCategories.forEach(cat => {
      console.log(`  - ${cat.name} (${cat.key})`);
    });

    console.log('\n✅ All done! Canonical categories synchronized without replacing IDs.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

reseedCategories();
