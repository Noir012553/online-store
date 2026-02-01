/**
 * Input validation middleware using express-validator
 * Validates request body fields and returns errors if validation fails
 */

const { body, validationResult } = require('express-validator');

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
    .withMessage('Email là bắt buộc')
    .isEmail()
    .withMessage('Email không hợp lệ')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Mật khẩu là bắt buộc')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu phải ít nhất 6 ký tự'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Tên phải từ 1 đến 100 ký tự'),
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .isEmail()
    .withMessage('Email không hợp lệ')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Mật khẩu là bắt buộc'),
];

/**
 * Validation rules for updating user profile
 */
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Tên phải từ 1 đến 100 ký tự'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email không hợp lệ')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Số điện thoại phải từ 10-11 chữ số'),

  body('address')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Địa chỉ không được vượt quá 255 ký tự'),
];

/**
 * Validation rules for creating an order
 */
const validateCreateOrder = [
  body('orderItems')
    .isArray({ min: 1 })
    .withMessage('Đơn hàng phải có ít nhất 1 sản phẩm'),

  body('orderItems.*.product')
    .notEmpty()
    .withMessage('ID sản phẩm là bắt buộc'),

  body('orderItems.*.qty')
    .isInt({ min: 1 })
    .withMessage('Số lượng phải là số nguyên dương'),

  body('itemsPrice')
    .isFloat({ min: 0 })
    .withMessage('Giá sản phẩm phải là số dương'),

  body('taxPrice')
    .isFloat({ min: 0 })
    .withMessage('Tiền thuế phải là số dương'),

  body('totalPrice')
    .isFloat({ min: 1 })
    .withMessage('Tổng tiền phải lớn hơn 0'),

  body('customerPhone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Số điện thoại phải từ 10-11 chữ số'),

  body('customerName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Tên khách hàng phải từ 1 đến 100 ký tự'),

  body('customerEmail')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email không hợp lệ')
    .normalizeEmail(),
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateCreateOrder,
};
