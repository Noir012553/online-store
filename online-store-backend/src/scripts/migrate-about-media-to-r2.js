require('dotenv').config();

const mongoose = require('mongoose');
const Review = require('../models/Review');
const { ABOUT_MEDIA } = require('../config/aboutMedia');
const seedAboutMedia = require('../seeds/aboutMediaSeeder');
const { seedAboutReviewers } = require('../seeds/aboutMediaSeeder');

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  const teamAssets = await seedAboutMedia();
  const reviewerAssets = await seedAboutReviewers();
  const reviewerUpdates = await Promise.all(
    ABOUT_MEDIA.reviewers.map((reviewer, index) => Review.updateMany(
      {
        $or: [
          { avatarPublicId: reviewer.publicId },
          { name: reviewer.name },
        ],
      },
      {
        $set: {
          avatar: reviewerAssets[index].publicUrl,
          avatarPublicId: null,
          avatarAsset: reviewerAssets[index],
        },
      },
    )),
  );

  const missingReviewers = reviewerUpdates
    .map((result, index) => result.matchedCount === 0 ? ABOUT_MEDIA.reviewers[index].key : null)
    .filter(Boolean);
  console.table([...teamAssets, ...reviewerAssets]);
  if (missingReviewers.length) {
    console.warn(`No existing review records matched: ${missingReviewers.join(', ')}`);
  }
};

main()
  .catch(error => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
