/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 * Dịch review comments từ VI sang EN
 */

const Review = require('../models/Review');
const Product = require('../models/Product');
const translationSeederHelper = require('../services/translationSeederHelper');
const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');
const { getMessage } = require('../i18n/messages');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { ABOUT_MEDIA, getCloudinaryDeliveryUrl } = require('../config/aboutMedia');

/**
 * Seed dữ liệu đánh giá
 * Tạo một đánh giá động cho mỗi product
 * @param {Array} products - Danh sách products
 * @param {Array} users - Danh sách users
 */
const seedReviews = async (products, users) => {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Cannot seed reviews without products');
  }

  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Cannot seed reviews without users');
  }

  await Review.deleteMany({});

  const reviews = [];
  const ratings = [3, 4, 4.5, 5, 3.5];
  const testimonialComments = [
    'Excellent product quality, fast shipping and great customer service. Will come back again!',
    'Laptop matches the description perfectly, very reasonable price. Thank you for finding the perfect laptop.',
    'Very satisfied with product quality and after-sales service. Professional consultation team.',
    'Bought laptops twice here, always very pleased. Competitive pricing with guaranteed quality.',
    '0% installment support is great, I got the laptop of my dreams without financial worries.',
    'Full official warranty, excellent technical support. This is a trustworthy place to buy laptops.',
    'As a student, LaptopStore helped me get a great laptop at an affordable price.',
    'In-depth consultation, 24/7 support, LaptopStore is truly a trusted address for tech enthusiasts.',
  ];
  const testimonialReviewers = ABOUT_MEDIA.reviewers.map((reviewer, index) => ({
    ...reviewer,
    avatar: getCloudinaryDeliveryUrl(reviewer.publicId, 640),
    comment: testimonialComments[index],
  }));

  for (let i = 0; i < products.length; i++) {
    const productIdx = i % products.length;
    const userIdx = i % users.length;
    const reviewerIdx = i % testimonialReviewers.length;
    const reviewer = testimonialReviewers[reviewerIdx];

    reviews.push({
      name: reviewer.name,
      avatar: reviewer.avatar,
      avatarPublicId: reviewer.publicId,
      product: products[productIdx]._id,
      user: users[userIdx]._id,
      rating: ratings[i % ratings.length],
      comment: reviewer.comment,
      role: Object.fromEntries(
        getActiveLangCodes().map(lang => [
          lang,
          getMessage(lang.toUpperCase(), 'review.verifiedCustomer')
        ])
      ),
    });
  }

  const createdReviews = await Review.create(reviews);
  const reviewIdsByProduct = new Map();
  createdReviews.forEach((review) => {
    const productId = review.product.toString();
    const reviewIds = reviewIdsByProduct.get(productId) || [];
    reviewIds.push(review._id);
    reviewIdsByProduct.set(productId, reviewIds);
  });

  // 🚀 OPTIMIZED: Use MongoDB Aggregation Pipeline to calculate ratings
  // BEFORE: Loop N products × 1 find = N DB queries + N save = 2N operations
  // AFTER: 1 Aggregation + 1 bulkWrite = 2 operations total
  console.log(`\n[Step 1/2] Updating product ratings using Aggregation Pipeline...`);
  console.time(`${CLI_SYMBOLS.duration} Bulk rating update`);

  let ratingStats = [];
  try {
    // Aggregation: Group reviews by product, calculate avg rating and count
    ratingStats = await Review.aggregate([
      { $match: { isDeleted: false } },
      { $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      }},
    ]);

    console.log(`${CLI_SYMBOLS.chart} Calculated ratings for ${ratingStats.length} products`);

    // Bulk update products with their ratings (1 DB operation for all)
    if (ratingStats.length > 0) {
      const bulkOps = ratingStats.map(stat => ({
        updateOne: {
          filter: { _id: stat._id },
          update: {
            $set: {
              rating: Number(stat.avgRating.toFixed(1)),
              numReviews: stat.reviewCount,
              reviews: reviewIdsByProduct.get(stat._id.toString()) || [],
            },
          },
        },
      }));

      const updateResult = await Product.bulkWrite(bulkOps);
      console.log(`${CLI_SYMBOLS.success} Updated ${updateResult.modifiedCount} products with ratings`);
    }

    console.timeEnd(`${CLI_SYMBOLS.duration} Bulk rating update`);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error during aggregation-based rating update:`, error.message);
    throw error;
  }

  // Tầng 2: Translate reviews to other supported languages
  console.log(`\n[Step 2/2] Starting automatic translation of ${createdReviews.length} reviews to supported languages...`);
  console.time(`${CLI_SYMBOLS.duration} Batch review translation`);

  try {
    const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');
    const defaultLang = getDefaultLanguage().code;
    const targetLangs = getActiveLangCodes().filter(l => l !== defaultLang);
    await translationSeederHelper.translateReviewsBatch(createdReviews, targetLangs);
  } catch (translationError) {
    console.warn(
      `${CLI_SYMBOLS.warning} Review translation failed (non-blocking): ${translationError.message}`
    );
    console.log(`${CLI_SYMBOLS.idea} Translations can be added manually later via translation API`);
  }

  console.timeEnd(`${CLI_SYMBOLS.duration} Batch review translation`);
  console.log(`\n${CLI_SYMBOLS.chartUp} REVIEW SEEDING COMPLETE:\n   ${CLI_SYMBOLS.bullet} Reviews created: ${createdReviews.length}\n   ${CLI_SYMBOLS.bullet} Products rated: ${ratingStats.length}`);

  return createdReviews;
};

module.exports = seedReviews;
