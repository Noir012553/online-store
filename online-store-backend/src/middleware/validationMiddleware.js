/**
 * Input validation middleware using express-validator
 * Validates request body fields and returns errors if validation fails
 */

const { body, validationResult } = require('express-validator');
const { getMessage } = require('../i18n/messages');

/**
 * Middleware to check validation errors and return 400 if any
 * Used after validation middlewares in routes
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_FAILED',
      message: getMessage(req.lang, 'common.error_request_title'),
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * Validation rules for user registration
 * Note: username không được gửi - backend tự tạo từ email
 */
const validateRegister = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.email.required'))
    .isEmail()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.email.invalid'))
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.password.required'))
    .isLength({ min: 6 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.password.minLength')),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.name.lengthRange')),
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.email.required'))
    .isEmail()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.email.invalid'))
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.password.required')),
];

/**
 * Validation rules for updating user profile
 */
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.name.lengthRange')),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.email.invalid'))
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,11}$/)
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.phone.invalid')),

  body('address')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.address.maxLength')),
];

/**
 * Validation rules for creating an order
 * Frontend gửi cartItems (từ giỏ hàng) - Backend sẽ tự tính giá từ Database
 */
const validateCreateOrder = [
  body('cartItems')
    .isArray({ min: 1 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.cart.empty')),

  body('cartItems.*.productId')
    .notEmpty()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.product.idRequired')),

  body('cartItems.*.quantity')
    .isInt({ min: 1 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.quantity.invalid')),

  body('shippingAddress')
    .notEmpty()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.shipping.addressRequired')),

  body('paymentMethod')
    .optional()
    .trim(),

  body('customerPhone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,11}$/)
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.phone.invalid')),

  body('customerName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.customer.nameInvalid')),

  body('customerEmail')
    .optional()
    .trim()
    .isEmail()
    .withMessage((value, { req }) => getMessage(req.lang, 'validation.email.invalid'))
    .normalizeEmail(),
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateCreateOrder,
};
