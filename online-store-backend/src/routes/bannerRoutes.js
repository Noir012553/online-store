const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadCloudinary } = require('../middleware/uploadMiddleware');
const {
  getBanners,
  getBannerById,
  getDeletedBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  restoreBanner,
  hardDeleteBanner,
  getBannerSlots,
  getBannerTranslations,
  createBannerTranslation,
  updateBannerTranslation,
  deleteBannerTranslation,
  autoTranslateBanner,
} = require('../controllers/bannerController');

const router = express.Router();

// Static routes (no params)
router.get('/slots', getBannerSlots);
router.get('/deleted/list', protect, admin, getDeletedBanners);

// Collection routes
router.get('/', getBanners);
router.post('/', protect, admin, uploadCloudinary.single('image'), createBanner);

// Translation routes (specific, must come before /:id routes)
router.get('/:id/translations', getBannerTranslations);
router.post('/:id/translations', protect, admin, createBannerTranslation);
router.post('/:id/auto-translate', protect, admin, autoTranslateBanner);
router.put('/:id/translations/:translationId', protect, admin, updateBannerTranslation);
router.delete('/:id/translations/:translationId', protect, admin, deleteBannerTranslation);

// Special routes (before generic /:id routes)
router.put('/:id/restore', protect, admin, restoreBanner);
router.delete('/:id/hard', protect, admin, hardDeleteBanner);

// Generic /:id routes (must be last)
router.get('/:id', getBannerById);
router.put('/:id', protect, admin, uploadCloudinary.single('image'), updateBanner);
router.delete('/:id', protect, admin, deleteBanner);

module.exports = router;
