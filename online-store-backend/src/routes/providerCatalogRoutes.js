const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const providerCatalogController = require('../controllers/providerCatalogController');

const router = express.Router();

router.use(protect, superAdmin);
router.get('/registry', providerCatalogController.getRegistry);
router.get('/', providerCatalogController.list);
router.post('/', providerCatalogController.create);
router.get('/:id/audit', providerCatalogController.getAudit);
router.get('/:id', providerCatalogController.getById);
router.put('/:id', providerCatalogController.update);
router.delete('/:id', providerCatalogController.softDelete);
router.post('/:id/restore', providerCatalogController.restore);

module.exports = router;
