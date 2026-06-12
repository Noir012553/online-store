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
  uploadUserAvatar,
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
  hardDeleteUser,
  restoreUser,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  testSendEmail,
  googleAuth,
  googleAuthCallback,
  createUserByAdmin,
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');
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
  refreshTokenLimiter,
} = require('../middleware/rateLimitMiddleware');
const upload = require('../middleware/uploadMiddleware');

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
 * POST /api/users/admin/create - Tạo user mới bởi Admin
 * Admin có thể chỉ định role, username, email, password
 */
router.post('/admin/create', protect, admin, createUserByAdmin);

/**
 * POST /api/users/logout - Đăng xuất - Clear refresh token cookie
 */
router.post('/logout', logoutUser);

/**
 * POST /api/users/refresh - Refresh access token bằng refresh token
 * Rate limited: 30 attempts per hour per user/IP
 */
router.post('/refresh', refreshTokenLimiter, refreshAccessToken);

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
 * PUT /api/users/avatar - Upload user avatar
 * @body file - Image file (multipart/form-data)
 * @access Private
 */
router.put('/avatar', protect, upload.single('avatar'), uploadUserAvatar);

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
 * PUT /api/users/:id/restore - Khôi phục người dùng đã xóa mềm (Admin only)
 */
router.put('/:id/restore', protect, admin, restoreUser);

/**
 * DELETE /api/users/:id/hard - Xóa cứng người dùng (Admin only)
 */
router.delete('/:id/hard', protect, admin, hardDeleteUser);

/**
 * POST /api/users/test-email - Test gửi email xác minh (development only)
 * Để test email configuration
 */
router.post('/test-email', testSendEmail);

/**
 * GET /api/users/auth/google - Chuyển hướng tới trang đăng nhập Google
 * GET /api/users/auth/google/callback - Google OAuth callback endpoint
 */
router.get('/auth/google', googleAuth);
router.get('/auth/google/callback', googleAuthCallback);

module.exports = router;
