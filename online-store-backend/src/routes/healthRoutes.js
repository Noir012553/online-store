const express = require('express');
const healthController = require('../controllers/healthController');
const { getExportMetrics, getExportMetricsPrometheus } = require('../services/exportMetrics');
const { getStorageStatus } = require('../services/exportStorage');

const router = express.Router();

router.get('/cloudflare/health', healthController.checkCloudflareHealth);
router.get('/cloudflare/stats', healthController.getCloudflareStats);
router.get('/cloudflare/config', healthController.getCloudflareConfig);
router.post('/cloudflare/stats/reset', healthController.resetCloudflareStats);
router.get('/system', healthController.getSystemHealth);
router.get('/exports', (req, res) => {
  res.json({
    service: 'exports',
    timestamp: new Date().toISOString(),
    storage: getStorageStatus(),
    ...getExportMetrics(),
  });
});
router.get('/exports/prometheus', (req, res) => {
  res.type('text/plain').send(getExportMetricsPrometheus());
});

module.exports = router;
