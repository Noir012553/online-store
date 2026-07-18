const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currencyController');
const { protect, superAdmin } = require('../middleware/authMiddleware');

// Public: Get all active currencies
router.get('/', currencyController.getAllCurrencies);

// Admin: Get currency by ID
router.get('/:id', protect, superAdmin, currencyController.getCurrencyById);

// Admin: Create new currency
router.post('/', protect, superAdmin, currencyController.createCurrency);

// Admin: Update currency
router.put('/:id', protect, superAdmin, currencyController.updateCurrency);

// Admin: Delete currency
router.delete('/:id', protect, superAdmin, currencyController.deleteCurrency);

module.exports = router;
