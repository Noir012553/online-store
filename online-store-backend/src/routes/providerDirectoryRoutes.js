const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const providerDirectoryController = require('../controllers/providerDirectoryController');

const router = express.Router();
router.use(protect, superAdmin);
router.get('/', providerDirectoryController.listProviders);
router.post('/', providerDirectoryController.createProvider);
router.patch('/:id', providerDirectoryController.updateProvider);
router.delete('/:id', providerDirectoryController.deleteProvider);
router.put('/:id/restore', providerDirectoryController.restoreProvider);

module.exports = router;
