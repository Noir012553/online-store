#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const seedI18nMessages = require('../src/seeds/i18nMessagesSeeder');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptopstore';

async function main() {
  try {
    console.log('[seed-i18n] Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('[seed-i18n] Connected ✓');

    console.log('[seed-i18n] Running seeder...');
    await seedI18nMessages();

    console.log('[seed-i18n] ✅ Done! All i18n messages seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('[seed-i18n] ❌ Error:', error);
    process.exit(1);
  }
}

main();
