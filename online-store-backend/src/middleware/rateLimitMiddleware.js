/**
 * Rate limiting middleware to prevent brute force attacks
 * Limits login and registration attempts per IP address
 */

const rateLimit = require('express-rate-limit');

/**
 * Login rate limiter
 * 5 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for successful logins (optional)
    return false;
  },
});

/**
 * Register rate limiter
 * 3 attempts per hour per IP
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests
  message: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 giờ.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Password reset request limiter
 * 3 attempts per hour per IP
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests
  message: 'Quá nhiều yêu cầu reset mật khẩu. Vui lòng thử lại sau 1 giờ.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Global API rate limiter
 * 100 requests per 15 minutes per IP
 * Áp dụng cho tất cả /api/* routes để ngăn DoS/scraping
 * Skip ở development mode để tiện testing
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests
  message: 'Quá nhiều request. Vui lòng thử lại sau 15 phút.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting ở development mode
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    // Skip rate limiting cho health check endpoint
    return req.path === '/';
  },
});

/**
 * Order creation limiter
 * 5 orders per hour per IP
 * Prevent order bombing attacks
 */
const createOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 orders per hour
  message: 'Quá nhiều yêu cầu tạo đơn hàng. Vui lòng thử lại sau 1 giờ.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?._id ? `user_${req.user._id}` : req.ip;
  },
});

/**
 * Payment initiation limiter
 * 10 payment attempts per hour per IP
 * Prevent payment spam
 */
const initiatePaymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 payment attempts per hour
  message: 'Quá nhiều yêu cầu thanh toán. Vui lòng thử lại sau 1 giờ.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id ? `user_${req.user._id}` : req.ip;
  },
});

/**
 * Add to cart limiter (if cart becomes server-side in future)
 * 50 updates per minute per IP
 */
const updateCartLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 updates per minute
  message: 'Quá nhiều cập nhật giỏ hàng. Vui lòng thử lại sau 1 phút.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Token refresh limiter
 * 30 refresh attempts per hour per user/IP
 * Prevent token refresh brute force attacks
 */
const refreshTokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 refresh attempts per hour
  message: 'Quá nhiều yêu cầu làm mới token. Vui lòng thử lại sau 1 giờ.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID from cookie/token if available, otherwise use IP
    return req.user?._id ? `user_${req.user._id}` : req.ip;
  },
});


module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  globalLimiter,
  createOrderLimiter,
  initiatePaymentLimiter,
  updateCartLimiter,
  refreshTokenLimiter,
};
