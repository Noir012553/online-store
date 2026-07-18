const express = require('express');
const router = express.Router();
const exchangeRateController = require('../controllers/exchangeRateController');
const { protect, superAdmin } = require('../middleware/authMiddleware');

// Public: Convert amount
router.post('/convert', exchangeRateController.convertAmount);

// Public: Get exchange rate pair
router.get('/pair/:fromCode/:toCode', exchangeRateController.getExchangeRatePair);

// Admin: Update exchange rates now (PHASE 3.5)
router.post('/scheduler/update', protect, superAdmin, exchangeRateController.updateRatesNow);

// Admin: Get scheduler status (PHASE 3.5)
router.get('/scheduler/status', protect, superAdmin, exchangeRateController.getSchedulerStatus);

// Public: Get exchange rate history (PHASE 3.5)
router.get('/history/:fromCode/:toCode', exchangeRateController.getExchangeRateHistory);

// Public: Get exchange rate stats (PHASE 3.5)
router.get('/stats/:fromCode/:toCode', exchangeRateController.getExchangeRateStats);

// Public: Get all exchange rates
router.get('/', exchangeRateController.getAllExchangeRates);

// Admin: Get exchange rate by ID
router.get('/:id', protect, superAdmin, exchangeRateController.getExchangeRateById);

// Admin: Create new exchange rate
router.post('/', protect, superAdmin, exchangeRateController.createExchangeRate);

// Admin: Update exchange rate
router.put('/:id', protect, superAdmin, exchangeRateController.updateExchangeRate);

// Admin: Delete exchange rate
router.delete('/:id', protect, superAdmin, exchangeRateController.deleteExchangeRate);

module.exports = router;
