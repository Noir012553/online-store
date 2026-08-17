require('dotenv').config();
const mongoose = require('mongoose');
const seedTranslations = require('./translationSeeder');

const main = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const results = await seedTranslations();

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

main();
