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
      message: 'Validation failed',
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
    .withMessage(getMessage('VI', 'validation.email.required'))
    .isEmail()
    .withMessage(getMessage('VI', 'validation.email.invalid'))
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage(getMessage('VI', 'validation.password.required'))
    .isLength({ min: 6 })
    .withMessage(getMessage('VI', 'validation.password.minLength')),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage(getMessage('VI', 'validation.name.lengthRange')),
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage(getMessage('VI', 'validation.email.required'))
    .isEmail()
    .withMessage(getMessage('VI', 'validation.email.invalid'))
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage(getMessage('VI', 'validation.password.required')),
];

/**
 * Validation rules for updating user profile
 */
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage(getMessage('VI', 'validation.name.lengthRange')),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage(getMessage('VI', 'validation.email.invalid'))
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,11}$/)
    .withMessage(getMessage('VI', 'validation.phone.invalid')),

  body('address')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage(getMessage('VI', 'validation.address.maxLength')),
];

/**
 * Validation rules for creating an order
 * Frontend gửi cartItems (từ giỏ hàng) - Backend sẽ tự tính giá từ Database
 */
const validateCreateOrder = [
  body('cartItems')
    .isArray({ min: 1 })
    .withMessage(getMessage('VI', 'validation.cart.empty')),

  body('cartItems.*.productId')
    .notEmpty()
    .withMessage(getMessage('VI', 'validation.product.idRequired')),

  body('cartItems.*.quantity')
    .isInt({ min: 1 })
    .withMessage(getMessage('VI', 'validation.quantity.invalid')),

  body('shippingAddress')
    .notEmpty()
    .withMessage(getMessage('VI', 'validation.shipping.addressRequired')),

  body('paymentMethod')
    .optional()
    .trim(),

  body('customerPhone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,11}$/)
    .withMessage(getMessage('VI', 'validation.phone.invalid')),

  body('customerName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage(getMessage('VI', 'validation.customer.nameInvalid')),

  body('customerEmail')
    .optional()
    .trim()
    .isEmail()
    .withMessage(getMessage('VI', 'validation.email.invalid'))
    .normalizeEmail(),
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateCreateOrder,
};
