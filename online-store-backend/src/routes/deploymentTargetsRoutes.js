const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const controller = require('../controllers/deploymentTargetsController');

const router = express.Router();
router.use(protect, superAdmin);
router.get('/', controller.getDeploymentTargets);
router.put('/', controller.updateDeploymentTargets);

module.exports = router;
