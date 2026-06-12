const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
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
} = require('../controllers/bannerController');

const router = express.Router();

router.get('/slots', getBannerSlots);
router.get('/deleted/list', protect, admin, getDeletedBanners);
router.get('/', getBanners);
router.post('/', protect, admin, upload.single('image'), createBanner);
router.get('/:id', getBannerById);
router.put('/:id', protect, admin, upload.single('image'), updateBanner);
router.delete('/:id', protect, admin, deleteBanner);
router.put('/:id/restore', protect, admin, restoreBanner);
router.delete('/:id/hard', protect, admin, hardDeleteBanner);

module.exports = router;
