const express = require('express');
const router = express.Router();
const {
  getPaymentMethods,
  getPaymentMethodById
} = require('../controllers/paymentController');

/**
 * GET /api/payment/methods
 * Get all available payment methods with provider info and logos
 */
router.get('/methods', getPaymentMethods);

/**
 * GET /api/payment/:id
 * Get specific payment method details
 */
router.get('/:id', getPaymentMethodById);

module.exports = router;
