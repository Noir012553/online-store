const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const paymentMethodController = require('../controllers/paymentMethodController');

const router = express.Router();
router.use(protect, superAdmin);
router.get('/', paymentMethodController.listAdminPaymentMethods);
router.patch('/:code', paymentMethodController.updateAdminPaymentMethod);
router.delete('/:code', paymentMethodController.deleteAdminPaymentMethod);

module.exports = router;
