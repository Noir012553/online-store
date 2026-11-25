const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const deploymentController = require('../controllers/deploymentController');

const router = express.Router();
router.use('/config/runner-token/reveal', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
router.use(protect, superAdmin);
router.post('/config/runner-token/reveal', deploymentController.revealRunnerToken);
router.get('/config', deploymentController.getConfig);
router.put('/config', deploymentController.updateConfig);
router.get('/status', deploymentController.getStatus);
router.post('/preflight', deploymentController.preflight);
router.post('/cutover', deploymentController.startCutover);
router.post('/rollback', deploymentController.rollback);
router.get('/jobs/:jobId', deploymentController.getJob);
router.get('/audit', deploymentController.getAudit);

module.exports = router;
