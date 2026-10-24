/**
 * Newsletter Routes
 * Đăng ký, hủy đăng ký, quản lý subscribers
 * 
 * Routes:
 * POST   /api/newsletter              - Subscribe (public)
 * POST   /api/newsletter/unsubscribe  - Unsubscribe (public)
 * GET    /api/newsletter/subscribers  - Get subscribers list (admin only)
 */

const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * POST /api/newsletter
 * Subscribe to newsletter
 * Public route - no authentication required
 * 
 * Body:
 * {
 *   "email": "user@example.com",
 *   "phone": "0901234567"
 * }
 */
router.post('/', newsletterController.subscribe);

/**
 * POST /api/newsletter/unsubscribe
 * Unsubscribe from newsletter
 * Public route
 * 
 * Body:
 * {
 *   "email": "user@example.com"
 * }
 */
router.post('/unsubscribe', newsletterController.unsubscribe);

/**
 * GET /api/newsletter/subscribers
 * Get list of newsletter subscribers
 * Admin only
 * 
 * Query:
 * - status: 'active' | 'unsubscribed' (default: 'active')
 * - page: number (default: 1)
 * - limit: number (default: 50)
 */
router.get('/subscribers', protect, admin, newsletterController.getSubscribers);

module.exports = router;
