/**
 * Controller xác thực & quản lý người dùng
 * Xử lý: login, register, profile, user list, soft/hard delete
 * Hỗ trợ JWT authentication, role-based authorization (user/admin/super-admin)
 */
const asyncHandler = require('express-async-handler');
const { generateToken, generateTokenPair } = require('../utils/generateToken');
const { generatePasswordResetToken } = require('../utils/resetTokenGenerator');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../services/emailService');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Xác thực người dùng và cấp JWT token
 * @route POST /api/users/login
 * @access Public
 */
const authUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        const { accessToken, refreshToken } = generateTokenPair(user._id);

        // Set refresh token in httpOnly secure cookie (not accessible from JavaScript)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,           // Cannot be accessed from JavaScript (XSS protection)
            secure: process.env.NODE_ENV === 'production',  // Only send over HTTPS in production
            sameSite: 'strict',       // CSRF protection
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            path: '/api/users/refresh',  // Only sent to refresh endpoint
        });

        // Return access token & user info (refresh token NOT in response body)
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            token: accessToken,
            accessToken,
            // refreshToken NOT returned in body - it's in httpOnly cookie
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

/**
 * Đăng ký tài khoản người dùng mới
 * Role mặc định là 'user', không cho phép tự chọn
 * @route POST /api/users
 * @access Public
 */
const registerUser = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    // Generate email verification token
    const { token: verificationToken, hashedToken, expires } = generatePasswordResetToken();

    const user = await User.create({
        username,
        email,
        password,
        emailVerificationToken: hashedToken,
        emailVerificationExpire: expires,
        isEmailVerified: false,
    });

    if (user) {
        const { accessToken, refreshToken } = generateTokenPair(user._id);

        // Set refresh token in httpOnly secure cookie (not accessible from JavaScript)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,           // Cannot be accessed from JavaScript (XSS protection)
            secure: process.env.NODE_ENV === 'production',  // Only send over HTTPS in production
            sameSite: 'strict',       // CSRF protection
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            path: '/api/users/refresh',  // Only sent to refresh endpoint
        });

        // Gửi email xác minh
        try {
            const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
            await sendVerificationEmail(user.email, verificationUrl);
        } catch (emailError) {
            console.warn('⚠️ Email verification could not be sent:', emailError.message);
            // Không throw error, cho phép user tiếp tục
            // Email có thể được resend lại
        }

        res.status(201).json({
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
            token: accessToken,
            accessToken,
            message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.',
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

/**
 * Lấy thông tin profile của người dùng hiện tại
 * @route GET /api/users/profile
 * @access Private
 */
const getUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

/**
 * Cập nhật thông tin profile của người dùng hiện tại
 * Hỗ trợ cập nhật: username, email, password
 * @route PUT /api/users/profile
 * @access Private
 */
const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.username = req.body.username || user.username;
        user.email = req.body.email || user.email;
        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

/**
 * Lấy danh sách tất cả người dùng (Admin only)
 * Hỗ trợ phân trang, tìm kiếm theo username/email
 * @route GET /api/users
 * @access Private/Admin
 */
const getUsers = asyncHandler(async (req, res) => {
    const pageSize = parseInt(req.query.pageSize) || 10;
    const page = parseInt(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
        ? {
              $or: [
                  { username: { $regex: req.query.keyword, $options: 'i' } },
                  { email: { $regex: req.query.keyword, $options: 'i' } },
              ],
          }
        : {};

    const count = await User.countDocuments({ ...keyword, isDeleted: false });
    const users = await User.find({ ...keyword, isDeleted: false })
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    res.json({ users, page, pages: Math.ceil(count / pageSize) });
});

/**
 * Lấy chi tiết người dùng theo ID (Admin only)
 * @route GET /api/users/:id
 * @access Private/Admin
 */
const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false }).select('-password');

    if (user) {
        res.json(user);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

/**
 * Cập nhật thông tin người dùng (Admin only)
 * Cho phép thay đổi: username, email, role
 * @route PUT /api/users/:id
 * @access Private/Admin
 */
const updateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.username = req.body.username || user.username;
        user.email = req.body.email || user.email;
        user.role = req.body.role || user.role;

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

/**
 * Xóa mềm người dùng (Admin only)
 * Người dùng vẫn tồn tại trong DB nhưng không hiển thị
 * @route DELETE /api/users/:id
 * @access Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.isDeleted = true;
        await user.save();
        res.json({ message: 'User removed' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

/**
 * Xóa cứng người dùng (Super Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/users/:id/hard
 * @access Private/SuperAdmin
 */
const hardDeleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    await user.deleteOne();
    res.json({ message: 'User permanently removed' });
});

/**
 * Request password reset token (gửi email với reset link)
 * @route POST /api/users/forgot-password
 * @access Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw new Error('Email is required');
    }

    const user = await User.findOne({ email });

    if (!user) {
        // Don't reveal if email exists for security
        res.json({
            message: 'Nếu email tồn tại, link reset sẽ được gửi. Vui lòng kiểm tra email của bạn.',
        });
        return;
    }

    // Generate reset token
    const { token, hashedToken, expires } = generatePasswordResetToken();

    // Save hashed token to user
    user.passwordResetToken = hashedToken;
    user.passwordResetExpire = expires;
    await user.save();

    // Gửi email reset password
    try {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
        await sendResetPasswordEmail(user.email, resetUrl);
    } catch (emailError) {
        console.warn('⚠️ Reset password email could not be sent:', emailError.message);
        // Không throw error, không tiết lộ token ngoài email
    }

    res.json({
        message: 'Nếu email tồn tại, link reset sẽ được gửi. Vui lòng kiểm tra email của bạn.',
    });
});

/**
 * Reset password bằng reset token
 * @route POST /api/users/reset-password
 * @access Public (reset token required)
 */
const resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        res.status(400);
        throw new Error('Token and new password are required');
    }

    // Hash token to compare
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    // Find user by reset token that hasn't expired
    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpire: { $gt: new Date() },
    });

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired reset token');
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpire = null;
    await user.save();

    res.json({
        message: 'Mật khẩu đã được thay đổi thành công',
    });
});

/**
 * Xác minh email người dùng
 * @route POST /api/users/verify-email
 * @access Public (verification token required)
 */
const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
        res.status(400);
        throw new Error('Verification token is required');
    }

    // Hash token để compare
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    // Find user by verification token that hasn't expired
    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpire: { $gt: new Date() },
    });

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired verification token');
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpire = null;
    await user.save();

    res.json({
        message: 'Email đã được xác minh thành công',
        isEmailVerified: true,
    });
});

/**
 * Resend email verification
 * @route POST /api/users/resend-verification
 * @access Private (authenticated users only)
 */
const resendVerificationEmail = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (user.isEmailVerified) {
        res.json({
            message: 'Email của bạn đã được xác minh',
        });
        return;
    }

    // Generate new verification token
    const { token, hashedToken, expires } = generatePasswordResetToken();

    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpire = expires;
    await user.save();

    // Gửi lại email xác minh
    try {
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
        await sendVerificationEmail(user.email, verificationUrl);
    } catch (emailError) {
        console.warn('⚠️ Verification email could not be sent:', emailError.message);
        // Không throw error, cho phép user request lại
    }

    res.json({
        message: 'Email xác minh đã được gửi lại. Vui lòng kiểm tra email của bạn.',
    });
});

/**
 * Đăng xuất người dùng - Clear refresh token cookie
 * @route POST /api/users/logout
 * @access Public
 */
const logoutUser = asyncHandler(async (req, res) => {
    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
        path: '/api/users/refresh',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });

    res.json({
        message: 'Đã đăng xuất thành công',
    });
});

/**
 * Refresh access token bằng refresh token từ httpOnly cookie
 * @route POST /api/users/refresh
 * @access Public (refresh token in httpOnly cookie)
 */
const refreshAccessToken = asyncHandler(async (req, res) => {
    // Get refresh token from httpOnly cookie (more secure than from body)
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
        res.status(401);
        throw new Error('Refresh token is required');
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            res.status(401);
            throw new Error('User not found');
        }

        // Generate new tokens
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokenPair(user._id);

        // Update refresh token cookie (Token rotation)
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            path: '/api/users/refresh',
        });

        // Return only access token (refresh token is in secure cookie)
        res.json({
            accessToken: newAccessToken,
        });
    } catch (error) {
        // Clear invalid refresh token
        res.clearCookie('refreshToken', {
            path: '/api/users/refresh'
        });
        res.status(401);
        throw new Error('Invalid refresh token');
    }
});

module.exports = {
    authUser,
    registerUser,
    getUserProfile,
    updateUserProfile,
    getUsers,
    deleteUser,
    hardDeleteUser,
    getUserById,
    updateUser,
    refreshAccessToken,
    logoutUser,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerificationEmail,
};
