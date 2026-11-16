const asyncHandler = require('express-async-handler');
const paymentMethodService = require('../services/paymentMethodService');
const paymentService = require('../services/paymentService');

const listAdminPaymentMethods = asyncHandler(async (_req, res) => {
  const methods = await paymentMethodService.listPaymentMethods();
  res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache' });
  res.status(200).json({
    success: true,
    data: {
      methods: methods.map(method => ({
        code: method.code,
        name: method.name,
        description: method.description,
        isEnabled: method.isEnabled,
        isDeleted: method.isDeleted,
        available: !method.isDeleted && method.isEnabled && (method.code !== 'vnpay' || paymentService.isGatewaySupported('vnpay')),
        createdAt: method.createdAt,
        updatedAt: method.updatedAt,
      })),
    },
  });
});

const updateAdminPaymentMethod = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const updates = {};
  if (typeof req.body.name === 'string') updates.name = req.body.name.trim();
  if (typeof req.body.description === 'string') updates.description = req.body.description.trim();
  if (typeof req.body.isEnabled === 'boolean') updates.isEnabled = req.body.isEnabled;
  if (typeof req.body.isDeleted === 'boolean') updates.isDeleted = req.body.isDeleted;

  if (!['cod', 'vnpay'].includes(code) || !Object.keys(updates).length) {
    return res.status(400).json({ success: false, code: 'PAYMENT_METHOD_INVALID', message: 'Invalid payment method update.' });
  }

  if ((updates.name !== undefined && (updates.name.length < 2 || updates.name.length > 80))
    || (updates.description !== undefined && updates.description.length > 240)) {
    return res.status(400).json({ success: false, code: 'PAYMENT_METHOD_INVALID', message: 'Payment method fields are invalid.' });
  }

  if (updates.isDeleted === true) {
    updates.isEnabled = false;
  }
  if (updates.isDeleted === false && updates.isEnabled === undefined) {
    updates.isEnabled = true;
  }

  const method = await paymentMethodService.updatePaymentMethod(code, updates);
  if (!method) return res.status(404).json({ success: false, code: 'PAYMENT_METHOD_NOT_FOUND', message: 'Payment method not found.' });
  return res.status(200).json({ success: true, data: { method } });
});

const deleteAdminPaymentMethod = asyncHandler(async (req, res) => {
  const { code } = req.params;
  if (!['cod', 'vnpay'].includes(code)) {
    return res.status(400).json({ success: false, code: 'PAYMENT_METHOD_INVALID', message: 'Invalid payment method.' });
  }
  const method = await paymentMethodService.softDeletePaymentMethod(code);
  if (!method) return res.status(404).json({ success: false, code: 'PAYMENT_METHOD_NOT_FOUND', message: 'Payment method not found.' });
  return res.status(200).json({ success: true, data: { method } });
});

module.exports = {
  listAdminPaymentMethods,
  updateAdminPaymentMethod,
  deleteAdminPaymentMethod,
};
