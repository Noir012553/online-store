const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const providerConfigurationController = require('../controllers/providerConfigurationController');

const router = express.Router();

router.use(protect, superAdmin);
router.get('/runtime', providerConfigurationController.getRuntimeProviders);
router.get('/runtime/:providerCode', providerConfigurationController.getRuntimeProvider);
router.post('/runtime/:providerCode/reveal/:key', providerConfigurationController.revealRuntimeSecret);
router.get('/schema/:providerCode', providerConfigurationController.getSchema);
router.get('/:id', providerConfigurationController.get);
router.put('/:id', providerConfigurationController.save);
router.delete('/:id', providerConfigurationController.remove);
router.post('/:id/reveal/:field', providerConfigurationController.reveal);

module.exports = router;
