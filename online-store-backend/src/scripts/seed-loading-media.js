require('dotenv').config();

const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongoConnection');
const seedAboutMedia = require('../seeds/aboutMediaSeeder');

const main = async () => {
  await connectMongo();
  const record = await seedAboutMedia.seedLoadingMedia({ requireSource: true });
  console.table([{
    key: record.key,
    publicId: record.publicId,
    url: record.url,
    cloudinaryAccountId: record.cloudinaryAccountId,
    cloudName: record.cloudName,
  }]);
};

main()
  .catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
