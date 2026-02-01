/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Review = require('../models/Review');

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
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
      comment: 'Sản phẩm chất lượng tuyệt vời, giao hàng nhanh và dịch vụ khách hàng rất tuyệt. Tôi sẽ quay lại!',
    },
    {
      name: 'Trần Văn Hùng',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
      comment: 'Laptop đúng như mô tả, giá rất hợp lý. Cảm ơn LaptopStore đã giúp tôi tìm được chiếc laptop phù hợp.',
    },
    {
      name: 'Phạm Thị Linh',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
      comment: 'Rất hài lòng với chất lượng sản phẩm và dịch vụ sau bán hàng. Đội ngũ tư vấn rất chuyên nghiệp.',
    },
    {
      name: 'Lê Minh Tuấn',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
      comment: 'Mua laptop ở đây được 2 lần, lần nào cũng rất ưng ý. Giá cạnh tranh, chất lượng đảm bảo.',
    },
    {
      name: 'Võ Thị Mai',
      avatar: 'https://images.unsplash.com/photo-1517231143042-fbb3d5c1b7a7?w=400&h=400&fit=crop',
      comment: 'Hỗ trợ trả góp 0% rất tốt, mình mua được chiếc laptop mơ ước mà không lo về tài chính.',
    },
    {
      name: 'Đặng Văn Phong',
      avatar: 'https://images.unsplash.com/photo-1506025613140-f582f06e59a7?w=400&h=400&fit=crop',
      comment: 'Bảo hành chính hãng đầy đủ, hỗ trợ kỹ thuật rất tốt. Đây là nơi uy tín để mua laptop.',
    },
    {
      name: 'Hoàng Thanh Hà',
      avatar: 'https://images.unsplash.com/photo-1537639798096-46ac2afaafbb?w=400&h=400&fit=crop',
      comment: 'Mình là sinh viên, LaptopStore giúp tôi có được chiếc laptop tốt với giá vừa túi tiền.',
    },
    {
      name: 'Bùi Anh Tuấn',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
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

  return createdReviews;
};

module.exports = seedReviews;
