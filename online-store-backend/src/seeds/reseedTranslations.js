require('dotenv').config();
const mongoose = require('mongoose');
const StaticTranslation = require('../models/StaticTranslation');
const seedTranslations = require('./translationSeeder');

const main = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Clear old translations
    const deleteResult = await StaticTranslation.deleteMany({});

    // Seed fresh translations
    const results = await seedTranslations();

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

main();
