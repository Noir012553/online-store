const { Banner } = require('../models/Banner');
const {
  uploadFileToCloudinary,
  isCloudinaryUrl,
  extractPublicIdFromUrl,
} = require('../services/cloudinaryService');
const { getMessage } = require('../i18n/messages');
const { getActiveLangCodes } = require('../config/languageInventory');

const HOMEPAGE_HERO_SLOT = 'homepage_hero';
const SUPPORTED_LANGS = getActiveLangCodes();

const BANNER_SEED_CONFIG = [
  {
    sortOrder: 0,
    titleKey: 'banner_hero_1_title',
    subtitleKey: 'banner_hero_1_subtitle',
    descriptionKey: 'banner_hero_1_description',
    ctaKey: 'banner_hero_1_cta',
    targetUrl: '/products/laptop-gaming',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=1200',
  },
  {
    sortOrder: 1,
    titleKey: 'banner_hero_2_title',
    subtitleKey: 'banner_hero_2_subtitle',
    descriptionKey: 'banner_hero_2_description',
    ctaKey: 'banner_hero_2_cta',
    targetUrl: '/products/laptop-van-phong',
    image: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=1200',
  },
  {
    sortOrder: 2,
    titleKey: 'banner_hero_3_title',
    subtitleKey: 'banner_hero_3_subtitle',
    descriptionKey: 'banner_hero_3_description',
    ctaKey: 'banner_hero_3_cta',
    targetUrl: '/about',
    image: 'https://images.unsplash.com/photo-1706101035106-119828e7b564?w=1200',
  },
];

const buildBannerContent = (config) => {
  const content = {
    title: {},
    subtitle: {},
    description: {},
    ctaText: {},
  };

  SUPPORTED_LANGS.forEach(lang => {
    content.title[lang] = getMessage(lang, `homepage-banners-seed.${config.titleKey}`);
    content.subtitle[lang] = getMessage(lang, `homepage-banners-seed.${config.subtitleKey}`);
    content.description[lang] = getMessage(lang, `homepage-banners-seed.${config.descriptionKey}`);
    content.ctaText[lang] = getMessage(lang, `homepage-banners-seed.${config.ctaKey}`);
  });

  return content;
};

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
  const forceReset = process.argv.includes('--reset');

  const totalBannerCount = await Banner.countDocuments({
    slot: HOMEPAGE_HERO_SLOT,
  });

  if (forceReset && totalBannerCount > 0) {
    await Banner.deleteMany({ slot: HOMEPAGE_HERO_SLOT });
  } else if (totalBannerCount > 0) {
    return [];
  }

  const createdBanners = [];

  for (const config of BANNER_SEED_CONFIG) {
    try {
      const imageData = await resolveBannerImage(config.image);
      const bannerContent = buildBannerContent(config);

      const createdBanner = await Banner.create({
        title: bannerContent.title,
        subtitle: bannerContent.subtitle,
        description: bannerContent.description,
        ctaText: bannerContent.ctaText,
        targetUrl: config.targetUrl,
        image: imageData.image,
        imagePublicId: imageData.imagePublicId,
        slot: HOMEPAGE_HERO_SLOT,
        sortOrder: config.sortOrder,
        isActive: true,
        openInNewTab: false,
        startDate: new Date(),
        endDate: toEndDate(),
      });

      createdBanners.push(createdBanner);
    } catch (error) {
      console.error(`[SEED] Error seeding banner config ${config.sortOrder}:`, error.message);
    }
  }

  return createdBanners;
};

module.exports = seedHomepageHeroBanners;
