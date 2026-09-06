require('dotenv').config();

const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongoConnection');
const seedAboutMedia = require('../seeds/aboutMediaSeeder');

const main = async () => {
  await connectMongo();
  const records = await seedAboutMedia();
  console.table(records.map(({ key, publicId, url }) => ({ key, publicId, url })));
};

main()
  .catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
