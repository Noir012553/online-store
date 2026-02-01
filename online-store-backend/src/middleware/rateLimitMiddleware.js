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
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests
  message: 'Quá nhiều request. Vui lòng thử lại sau 15 phút.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting cho health check endpoint
    return req.path === '/';
  },
});

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  globalLimiter,
};
