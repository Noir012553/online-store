const { Banner } = require('../models/Banner');
const {
  uploadFileToCloudinary,
  isCloudinaryUrl,
  extractPublicIdFromUrl,
} = require('../services/cloudinaryService');

const HOMEPAGE_HERO_SLOT = 'homepage_hero';

const DEFAULT_HOMEPAGE_HERO_BANNERS = [
  {
    sortOrder: 0,
    title: {
      vi: 'Giảm giá 40%',
      en: '40% Discount',
    },
    subtitle: {
      vi: 'Laptop gaming và đồ họa',
      en: 'Gaming & Design Laptops',
    },
    description: {
      vi: 'Ưu đãi đặc biệt trong thời gian có hạn',
      en: 'Limited time special offer',
    },
    ctaText: {
      vi: 'Mua ngay',
      en: 'Shop Now',
    },
    targetUrl: '/products/laptop-gaming',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=1200',
  },
  {
    sortOrder: 1,
    title: {
      vi: 'Laptop văn phòng',
      en: 'Office Laptops',
    },
    subtitle: {
      vi: 'Giá tốt nhất thị trường',
      en: 'Best prices on the market',
    },
    description: {
      vi: 'Trả góp 0% lãi suất',
      en: '0% interest installment available',
    },
    ctaText: {
      vi: 'Xem thêm',
      en: 'View More',
    },
    targetUrl: '/products/laptop-van-phong',
    image: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=1200',
  },
  {
    sortOrder: 2,
    title: {
      vi: 'Bảo hành chính hãng',
      en: 'Genuine Warranty',
    },
    subtitle: {
      vi: 'Đổi mới trong 15 ngày',
      en: '15-day replacement warranty',
    },
    description: {
      vi: 'Hỗ trợ 24/7',
      en: '24/7 support available',
    },
    ctaText: {
      vi: 'Tìm hiểu thêm',
      en: 'Learn More',
    },
    targetUrl: '/about',
    image: 'https://images.unsplash.com/photo-1706101035106-119828e7b564?w=1200',
  },
];

const toEndDate = () => {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  return nextYear;
};

const resolveBannerImage = async (sourceUrl) => {
  // Nếu đã là Cloudinary URL, extract public ID
  if (isCloudinaryUrl(sourceUrl)) {
    return {
      image: sourceUrl,
      imagePublicId: extractPublicIdFromUrl(sourceUrl),
    };
  }

  // Nếu là external URL (http/https), dùng trực tiếp mà không cần upload
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    return {
      image: sourceUrl,
      imagePublicId: null,
    };
  }

  // Nếu là file path/buffer, thì mới upload
  try {
    const result = await uploadFileToCloudinary(sourceUrl, 'banners');
    return result;
  } catch (error) {
    return {
      image: sourceUrl,
      imagePublicId: null,
    };
  }
};

const seedHomepageHeroBanners = async () => {
  // Check if --reset flag is passed to force re-seed
  const forceReset = process.argv.includes('--reset');

  // Kiểm tra xem đã từng có banner ở slot homepage_hero chưa (bất kể isDeleted)
  // - Nếu có từng tồn tại → không seed lại (tránh xung đột)
  // - Nếu không tồn tại lần nào → seed lần đầu tiên (hoặc khi hard delete toàn bộ)
  // - Nếu --reset flag → force delete + seed lại
  const totalBannerCount = await Banner.countDocuments({
    slot: HOMEPAGE_HERO_SLOT,
  });

  if (forceReset && totalBannerCount > 0) {
    // Force reset: delete all existing banners in this slot
    await Banner.deleteMany({ slot: HOMEPAGE_HERO_SLOT });
  } else if (totalBannerCount > 0) {
    // Đã từng có banner rồi (hoặc soft delete), không seed lại
    return [];
  }

  const createdBanners = [];

  for (const bannerSeed of DEFAULT_HOMEPAGE_HERO_BANNERS) {
    try {
      const imageData = await resolveBannerImage(bannerSeed.image);

      const createdBanner = await Banner.create({
        title: bannerSeed.title,
        subtitle: bannerSeed.subtitle,
        description: bannerSeed.description,
        ctaText: bannerSeed.ctaText,
        targetUrl: bannerSeed.targetUrl,
        image: imageData.image,
        imagePublicId: imageData.imagePublicId,
        slot: HOMEPAGE_HERO_SLOT,
        sortOrder: bannerSeed.sortOrder,
        isActive: true,
        openInNewTab: false,
        startDate: new Date(),
        endDate: toEndDate(),
      });

      createdBanners.push(createdBanner);
    } catch (error) {
      // Continue with next banner instead of failing entire seed
    }
  }

  return createdBanners;
};

module.exports = seedHomepageHeroBanners;
module.exports.DEFAULT_HOMEPAGE_HERO_BANNERS = DEFAULT_HOMEPAGE_HERO_BANNERS;
