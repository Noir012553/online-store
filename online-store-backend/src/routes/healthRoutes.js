const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

router.get('/cloudflare/health', healthController.checkCloudflareHealth);
router.get('/cloudflare/stats', healthController.getCloudflareStats);
router.get('/cloudflare/config', healthController.getCloudflareConfig);
router.post('/cloudflare/stats/reset', healthController.resetCloudflareStats);
router.get('/system', healthController.getSystemHealth);

module.exports = router;
