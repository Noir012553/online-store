/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền, validation
 */

const express = require('express');
const router = express.Router();
const {
  authUser,
  registerUser,
  getUserProfile,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
  hardDeleteUser,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  googleLogin,
  testSendEmail,
} = require('../controllers/userController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');
const {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
} = require('../middleware/validationMiddleware');
const {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
} = require('../middleware/rateLimitMiddleware');

/**
 * POST /api/users - Đăng ký tài khoản người dùng mới
 * GET /api/users - Lấy danh sách tất cả người dùng (Admin only, phân trang)
 */
router.route('/')
  .post(registerLimiter, validateRegister, handleValidationErrors, registerUser)
  .get(protect, admin, getUsers);

/**
 * POST /api/users/login - Xác thực người dùng và cấp JWT token
 */
router.post('/login', loginLimiter, validateLogin, handleValidationErrors, authUser);

/**
 * POST /api/users/google-login - Đăng nhập bằng Google OAuth
 * Nhận Google ID Token từ frontend (@react-oauth/google)
 * Verify token, tạo/tìm user, cấp JWT token
 */
router.post('/google-login', loginLimiter, googleLogin);

/**
 * POST /api/users/logout - Đăng xuất - Clear refresh token cookie
 */
router.post('/logout', logoutUser);

/**
 * POST /api/users/refresh - Refresh access token bằng refresh token
 */
router.post('/refresh', refreshAccessToken);

/**
 * POST /api/users/forgot-password - Request password reset token
 */
router.post('/forgot-password', passwordResetLimiter, forgotPassword);

/**
 * POST /api/users/reset-password - Reset password với reset token
 */
router.post('/reset-password', resetPassword);

/**
 * POST /api/users/verify-email - Xác minh email với verification token
 */
router.post('/verify-email', verifyEmail);

/**
 * POST /api/users/resend-verification - Gửi lại email xác minh
 */
router.post('/resend-verification', protect, resendVerificationEmail);

/**
 * GET /api/users/profile - Lấy thông tin profile người dùng hiện tại
 * PUT /api/users/profile - Cập nhật profile người dùng hiện tại
 */
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, validateUpdateProfile, handleValidationErrors, updateUserProfile);

/**
 * GET /api/users/:id - Lấy chi tiết người dùng (Admin only)
 * PUT /api/users/:id - Cập nhật người dùng (Admin only)
 * DELETE /api/users/:id - Xóa mềm người dùng (Admin only)
 */
router.route('/:id')
  .get(protect, admin, getUserById)
  .put(protect, admin, updateUser)
  .delete(protect, admin, deleteUser);

/**
 * DELETE /api/users/:id/hard - Xóa cứng người dùng (Super Admin only)
 */
router.delete('/:id/hard', protect, superAdmin, hardDeleteUser);

/**
 * POST /api/users/test-email - Test gửi email xác minh (development only)
 * Để test email configuration
 */
router.post('/test-email', testSendEmail);

module.exports = router;
