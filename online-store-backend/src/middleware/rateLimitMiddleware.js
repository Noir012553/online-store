/**
 * Rate limiting middleware to prevent brute force attacks
 * Limits login and registration attempts per IP address
 */

const rateLimit = require('express-rate-limit');
const { getMessage } = require('../i18n/messages');

const rateLimitHandler = (code) => (req, res) => {
  res.status(429).json({
    success: false,
    code,
    message: getMessage(req.lang, 'errors.too_many_requests_title'),
    retryAfter: res.getHeader('Retry-After'),
  });
};

/**
 * Login rate limiter
 * 5 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  handler: rateLimitHandler('RATE_LIMIT_LOGIN'),
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
  handler: rateLimitHandler('RATE_LIMIT_REGISTER'),
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
  handler: rateLimitHandler('RATE_LIMIT_PASSWORD_RESET'),
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
  handler: rateLimitHandler('RATE_LIMIT_GLOBAL'),
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
  handler: rateLimitHandler('RATE_LIMIT_ORDER_CREATE'),
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
  handler: rateLimitHandler('RATE_LIMIT_PAYMENT'),
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
  handler: rateLimitHandler('RATE_LIMIT_CART_UPDATE'),
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
  handler: rateLimitHandler('RATE_LIMIT_TOKEN_REFRESH'),
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
