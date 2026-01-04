const express = require('express');
const router = express.Router();
const {
  createVNPayPaymentLink,
  handleVNPayIPN,
  handleVNPayReturn,
  getPaymentMethods,
  createCardPayment
} = require('../controllers/paymentIntegrationController');
const {
  getPaymentMethodById
} = require('../controllers/paymentController');

/**
 * GET /api/payment/methods
 * Get all available payment methods
 */
router.get('/methods', getPaymentMethods);

/**
 * GET /api/payment/:id
 * Get specific payment method details
 */
router.get('/:id', getPaymentMethodById);

/**
 * VNPay Integration Routes
 */

/**
 * POST /api/payment/vnpay/create
 * Create VNPay payment link
 */
router.post('/vnpay/create', createVNPayPaymentLink);

/**
 * POST /api/payment/vnpay/ipn
 * VNPay IPN callback (server-to-server)
 */
router.post('/vnpay/ipn', handleVNPayIPN);

/**
 * GET /api/payment/vnpay/return
 * VNPay return URL (user redirect after payment)
 */
router.get('/vnpay/return', handleVNPayReturn);

/**
 * Card Payment Routes
 */

/**
 * POST /api/payment/card/create
 * Process card payment
 */
router.post('/card/create', createCardPayment);

module.exports = router;
