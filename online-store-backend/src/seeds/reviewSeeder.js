/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 * Dịch review comments từ VI sang EN
 */

const Review = require('../models/Review');
const Product = require('../models/Product');
const translationSeederHelper = require('../services/translationSeederHelper');

/**
 * Seed dữ liệu đánh giá
 * Tạo 8 đánh giá động từ users cho các products
 * @param {Array} products - Danh sách products
 * @param {Array} users - Danh sách users
 */
const seedReviews = async (products, users) => {
  await Review.deleteMany({});

  const reviews = [];
  const ratings = [3, 4, 4.5, 5, 3.5];
  const testimonialReviewers = [
    {
      name: 'Nguyễn Thị Hương',
      avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Sản phẩm chất lượng tuyệt vời, giao hàng nhanh và dịch vụ khách hàng rất tuyệt. Tôi sẽ quay lại!',
    },
    {
      name: 'Trần Văn Hùng',
      avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Laptop đúng như mô tả, giá rất hợp lý. Cảm ơn LaptopStore đã giúp tôi tìm được chiếc laptop phù hợp.',
    },
    {
      name: 'Phạm Thị Linh',
      avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Rất hài lòng với chất lượng sản phẩm và dịch vụ sau bán hàng. Đội ngũ tư vấn rất chuyên nghiệp.',
    },
    {
      name: 'Lê Minh Tuấn',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Mua laptop ở đây được 2 lần, lần nào cũng rất ưng ý. Giá cạnh tranh, chất lượng đảm bảo.',
    },
    {
      name: 'Võ Thị Mai',
      avatar: 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Hỗ trợ trả góp 0% rất tốt, mình mua được chiếc laptop mơ ước mà không lo về tài chính.',
    },
    {
      name: 'Đặng Văn Phong',
      avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Bảo hành chính hãng đầy đủ, hỗ trợ kỹ thuật rất tốt. Đây là nơi uy tín để mua laptop.',
    },
    {
      name: 'Hoàng Thanh Hà',
      avatar: 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Mình là sinh viên, LaptopStore giúp tôi có được chiếc laptop tốt với giá vừa túi tiền.',
    },
    {
      name: 'Bùi Anh Tuấn',
      avatar: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
      comment: 'Tư vấn chuyên sâu, hỗ trợ 24/7, LaptopStore thực sự là địa chỉ tin cậy cho các tín đồ công nghệ.',
    },
  ];

  for (let i = 0; i < 8; i++) {
    const productIdx = i % products.length;
    const userIdx = i % users.length;
    const reviewerIdx = i % testimonialReviewers.length;
    const reviewer = testimonialReviewers[reviewerIdx];

    reviews.push({
      name: reviewer.name,
      avatar: reviewer.avatar,
      product: products[productIdx]._id,
      user: users[userIdx]._id,
      rating: ratings[i % ratings.length],
      comment: reviewer.comment,
    });
  }

  const createdReviews = await Review.create(reviews);

  // 🚀 OPTIMIZED: Use MongoDB Aggregation Pipeline to calculate ratings
  // BEFORE: Loop N products × 1 find = N DB queries + N save = 2N operations
  // AFTER: 1 Aggregation + 1 bulkWrite = 2 operations total
  console.log(`\n[Step 1/2] Updating product ratings using Aggregation Pipeline...`);
  console.time('⏱️ Bulk rating update');

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

    console.log(`📊 Calculated ratings for ${ratingStats.length} products`);

    // Bulk update products with their ratings (1 DB operation for all)
    if (ratingStats.length > 0) {
      const bulkOps = ratingStats.map(stat => ({
        updateOne: {
          filter: { _id: stat._id },
          update: {
            $set: {
              rating: Number(stat.avgRating.toFixed(1)),
              numReviews: stat.reviewCount,
            },
          },
        },
      }));

      const updateResult = await Product.bulkWrite(bulkOps);
      console.log(`✅ Updated ${updateResult.modifiedCount} products with ratings`);
    }

    console.timeEnd('⏱️ Bulk rating update');
  } catch (error) {
    console.error('❌ Error during aggregation-based rating update:', error.message);
    // Continue with translation even if rating update fails (non-blocking)
  }

  // Tầng 2: Translate reviews to English
  console.log(`\n[Step 2/2] Starting automatic translation of ${createdReviews.length} reviews to English...`);
  console.time('⏱️ Batch review translation');

  try {
    await translationSeederHelper.translateReviewsBatch(createdReviews, ['en']);
  } catch (translationError) {
    console.warn(
      `⚠️ Review translation failed (non-blocking): ${translationError.message}`
    );
    console.log(`💡 Translations can be added manually later via translation API`);
  }

  console.timeEnd('⏱️ Batch review translation');
  console.log(`\n📈 REVIEW SEEDING COMPLETE:\n   • Reviews created: ${createdReviews.length}\n   • Products rated: ${ratingStats.length}`);

  return createdReviews;
};

module.exports = seedReviews;
