#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const seedTranslations = require('./src/seeds/translationSeeder');

(async () => {
  try {
    // Connect to MongoDB
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI not set in environment variables');
    }

    await mongoose.connect(process.env.MONGO_URI);

    // Run seeder
    const results = await seedTranslations();

    // Disconnect
    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
})();
