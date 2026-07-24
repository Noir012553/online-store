/**
 * Controller xác thực & quản lý người dùng
 * Xử lý: login, register, profile, user list, soft/hard delete
 * Hỗ trợ JWT authentication, role-based authorization (user/admin/super-admin)
 */
const asyncHandler = require('express-async-handler');
const { generateToken, generateTokenPair, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require('../utils/generateToken');
const { generatePasswordResetToken } = require('../utils/resetTokenGenerator');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../services/emailService');
const { revokeToken } = require('../utils/tokenBlacklist');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');

const createUserError = (lang, code, messageKey) => {
  const error = new Error(getMessage(lang, messageKey));
  error.errorCode = code;
  return error;
};

/**
 * Xác thực người dùng và cấp JWT token
 * @route POST /api/users/login
 * @access Public
 */
const authUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        const { accessToken, refreshToken, refreshTokenId } = generateTokenPair(user._id);
        user.refreshTokenId = refreshTokenId;
        await user.save();

        // Set refresh token in httpOnly secure cookie (not accessible from JavaScript)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,           // Cannot be accessed from JavaScript (XSS protection)
            secure: process.env.NODE_ENV === 'production',  // Only send over HTTPS in production
            sameSite: 'lax',          // Allows same-site cookie in all cases
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            path: '/',                // Cookie sent with all requests
        });

        // Return access token & user info (refresh token NOT in response body)
        // NOTE: profileImage is stored as relative path in DB (e.g., /uploads/...)
        // Frontend will construct full URL using BACKEND_URL from config
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            name: user.name,
            phone: user.phone,
            address: user.address,
            profileImage: user.profileImage,
            role: user.role,
            token: accessToken,
            accessToken,
            // refreshToken NOT returned in body - it's in httpOnly cookie
        });
    } else {
        res.status(401);
        throw new Error(getMessage(req.lang, 'auth-messages.invalidEmailPassword'));
    }
});

/**
 * Đăng ký tài khoản người dùng mới
 * Role mặc định là 'user', không cho phép tự chọn
 * @route POST /api/users
 * @access Public
 */
const registerUser = asyncHandler(async (req, res) => {
    let { email, password, name } = req.body;

    // Tự động tạo username từ email
    // Lấy phần trước @ của email và thay non-alphanumeric thành _
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_');

    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error(getMessage(req.lang, 'user.alreadyExists'));
    }

    // Generate email verification token
    const { token: verificationToken, hashedToken, expires } = generatePasswordResetToken();

    const user = await User.create({
        username,
        email,
        password,
        name: name || null,
        emailVerificationToken: hashedToken,
        emailVerificationExpire: expires,
        isEmailVerified: false,
    });

    if (user) {
        const { accessToken, refreshToken, refreshTokenId } = generateTokenPair(user._id);
        user.refreshTokenId = refreshTokenId;
        await user.save();

        // Set refresh token in httpOnly secure cookie (not accessible from JavaScript)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,           // Cannot be accessed from JavaScript (XSS protection)
            secure: process.env.NODE_ENV === 'production',  // Only send over HTTPS in production
            sameSite: 'lax',          // Allows same-site cookie in all cases
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            path: '/',                // Cookie sent with all requests
        });

        // Gửi email xác minh
        try {
            const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
            await sendVerificationEmail(user.email, verificationUrl, req.lang);
        } catch (emailError) {
            console.warn('⚠️ Email verification could not be sent:', emailError.message);
            // Không throw error, cho phép user tiếp tục
            // Email có thể được resend lại
        }

        res.status(201).json({
            _id: user._id,
            username: user.username,
            email: user.email,
            name: user.name,
            phone: user.phone,
            address: user.address,
            profileImage: user.profileImage,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
            token: accessToken,
            accessToken,
            message: getMessage(req.lang, 'user.registrationSuccess'),
        });
    } else {
        res.status(400);
        throw new Error(getMessage(req.lang, 'user.invalidData'));
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
            name: user.name,
            phone: user.phone,
            address: user.address,
            profileImage: user.profileImage,
            role: user.role,
        });
    } else {
        res.status(404);
        throw new Error(getMessage(req.lang, 'user.notFound'));
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
        user.name = req.body.name || user.name;
        user.phone = req.body.phone || user.phone;
        user.address = req.body.address || user.address;
        if (req.body.password) {
            user.password = req.body.password;
        }

        const passwordChanged = !!req.body.password;
        const currentAccessToken = req.headers.authorization?.split(' ')[1];

        if (passwordChanged) {
            user.refreshTokenId = null;
        }

        const updatedUser = await user.save();

        if (passwordChanged && currentAccessToken) {
            try {
                const decodedAccess = jwt.verify(currentAccessToken, ACCESS_TOKEN_SECRET);
                await revokeToken(currentAccessToken, decodedAccess.id, 'password-change');
            } catch (error) {
                // Ignore token revocation errors here; password has already been changed.
            }
        }

        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            name: updatedUser.name,
            phone: updatedUser.phone,
            address: updatedUser.address,
            profileImage: updatedUser.profileImage,
            role: updatedUser.role,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error(getMessage(req.lang, 'user.notFound'));
    }
});

/**
 * Lấy danh sách tất cả người dùng (Admin only)
 * Hỗ trợ phân trang, tìm kiếm theo username/email, lọc theo deleted status
 * @route GET /api/users?deleted=true|false&pageSize=10&pageNumber=1
 * @access Private/Admin
 */
const getUsers = asyncHandler(async (req, res) => {
    const pageSize = parseInt(req.query.pageSize) || 10;
    const page = parseInt(req.query.pageNumber) || 1;
    const showDeleted = req.query.deleted === 'true';

    const keyword = req.query.keyword
        ? {
              $or: [
                  { username: { $regex: req.query.keyword, $options: 'i' } },
                  { email: { $regex: req.query.keyword, $options: 'i' } },
              ],
          }
        : {};

    const filter = { ...keyword, isDeleted: showDeleted };
    const count = await User.countDocuments(filter);
    const users = await User.find(filter)
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
        throw new Error(getMessage(req.lang, 'user.notFound'));
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
        throw new Error(getMessage(req.lang, 'user.notFound'));
    }
});

/**
 * Xóa mềm người dùng (Admin only)
 * Người dùng vẫn tồn tại trong DB nhưng không hiển thị
 * @route DELETE /api/users/:id
 * @access Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
    const { deleteOldFile } = require('../utils/fileCleanup');
    const user = await User.findById(req.params.id);

    if (user) {
        // Delete avatar file if exists
        if (user.profileImage) {
            deleteOldFile(user.profileImage);
        }
        user.isDeleted = true;
        await user.save();
        res.json({ message: getMessage(req.lang, 'admin-controllers-messages.user_deleted') });
    } else {
        res.status(404);
        throw new Error(getMessage(req.lang, 'user.notFound'));
    }
});

/**
 * Xóa cứng người dùng (Admin only)
 * Xóa vĩnh viễn khỏi database + xóa file avatar nếu có
 * @route DELETE /api/users/:id/hard
 * @access Private/Admin
 */
const hardDeleteUser = asyncHandler(async (req, res) => {
    const { deleteOldFile } = require('../utils/fileCleanup');
    const defaultLang = getDefaultLanguage();
    const lang = (req.query.lang || req.lang || defaultLang.code).toLowerCase();
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error(getMessage(lang, 'user.notFound'));
    }

    // Delete avatar file if exists
    if (user.profileImage) {
        deleteOldFile(user.profileImage);
    }

    await user.deleteOne();
    res.json({ message: getMessage(lang, 'user.hardDeleteSuccess') });
});

/**
 * Khôi phục người dùng đã xóa mềm (Admin only)
 * Set isDeleted = false để đưa user về trạng thái active
 * @route PUT /api/users/:id/restore
 * @access Private/Admin
 */
const restoreUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error(getMessage(req.lang, 'user.notFound'));
    }

    if (!user.isDeleted) {
        res.status(400);
        throw new Error(getMessage(req.lang, 'user.notDeleted'));
    }

    user.isDeleted = false;
    await user.save();

    res.json({ message: getMessage(req.lang, 'user.restoreSuccess'), user });
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
        throw new Error(getMessage(req.lang, 'admin-controllers-messages.email_required'));
    }

    const user = await User.findOne({ email });

    if (!user) {
        // Don't reveal if email exists for security
        res.json({
            message: getMessage(req.lang, 'user.passwordResetEmailSent'),
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
        await sendResetPasswordEmail(user.email, resetUrl, req.lang);
    } catch (emailError) {
        // Không throw error, không tiết lộ token ngoài email
    }

    res.json({
        message: getMessage(req.lang, 'user.passwordResetEmailSent'),
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
        throw createUserError(req.lang, 'USER_RESET_TOKEN_AND_PASSWORD_REQUIRED', 'user-messages.reset_token_and_password_required');
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
        throw new Error(getMessage(req.lang, 'admin-controllers-messages.invalid_reset_token'));
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpire = null;
    await user.save();

    res.json({
        message: getMessage(req.lang, 'user.passwordChangedSuccess'),
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
        throw createUserError(req.lang, 'USER_VERIFICATION_TOKEN_REQUIRED', 'user-messages.verification_token_required');
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
        throw new Error(getMessage(req.lang, 'admin-controllers-messages.invalid_verification_token'));
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpire = null;
    await user.save();

    res.json({
        message: getMessage(req.lang, 'user.emailVerifiedSuccess'),
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
        throw createUserError(req.lang, 'USER_NOT_FOUND', 'user-messages.user_not_found');
    }

    if (user.isEmailVerified) {
        res.json({
            message: getMessage(req.lang, 'user.emailAlreadyVerified'),
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
        await sendVerificationEmail(user.email, verificationUrl, req.lang);
    } catch (emailError) {
        console.warn('⚠️ Verification email could not be sent:', emailError.message);
        // Không throw error, cho phép user request lại
    }

    res.json({
        message: getMessage(req.lang, 'user.verificationEmailResent'),
    });
});

/**
 * Đăng xuất người dùng - Clear refresh token cookie + revoke access token
 * @route POST /api/users/logout
 * @access Public
 */
const logoutUser = asyncHandler(async (req, res) => {
    // Revoke access token (add to blacklist)
    const accessToken = req.headers.authorization?.split(' ')[1];
    const refreshToken = req.cookies.refreshToken;
    let userId = req.user?._id || null;

    if (accessToken) {
        try {
            const decodedAccess = jwt.verify(accessToken, ACCESS_TOKEN_SECRET);
            userId = userId || decodedAccess.id;
            await revokeToken(accessToken, decodedAccess.id, 'logout');
        } catch (error) {
            // Ignore invalid/expired access token during logout
        }
    }

    if (refreshToken) {
        try {
            const decodedRefresh = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
            userId = userId || decodedRefresh.id;
        } catch (error) {
            // Ignore invalid refresh token during logout
        }
    }

    if (userId) {
        await User.findByIdAndUpdate(userId, { refreshTokenId: null });
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });

    res.json({
        message: getMessage(req.lang, 'user.logoutSuccess'),
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
        throw createUserError(req.lang, 'REFRESH_TOKEN_REQUIRED', 'user-messages.refresh_token_required');
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        if (decoded.type && decoded.type !== 'refresh') {
            res.status(401);
            throw new Error(getMessage(req.lang, 'admin-controllers-messages.invalid_refresh_token_type'));
        }

        const user = await User.findById(decoded.id).select('+refreshTokenId');

        if (!user) {
            res.status(401);
            throw createUserError(req.lang, 'USER_NOT_FOUND', 'user-messages.user_not_found');
        }

        if (!user.refreshTokenId || decoded.jti !== user.refreshTokenId) {
            res.status(401);
            throw new Error(getMessage(req.lang, 'admin-controllers-messages.refresh_token_revoked'));
        }

        // Generate new tokens
        const { accessToken: newAccessToken, refreshToken: newRefreshToken, refreshTokenId } = generateTokenPair(user._id);
        user.refreshTokenId = refreshTokenId;
        await user.save();

        // Update refresh token cookie (Token rotation)
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            path: '/',
        });

        // Return only access token (refresh token is in secure cookie)
        res.json({
            accessToken: newAccessToken,
        });
    } catch (error) {
        // Clear invalid refresh token
        res.clearCookie('refreshToken', {
            path: '/',
            httpOnly: true,
            sameSite: 'lax'
        });
        res.status(401);
        throw createUserError(req.lang, 'REFRESH_TOKEN_INVALID', 'user-messages.invalid_refresh_token');
    }
});

/**
 * Test gửi email xác minh (chỉ dùng để test configuration)
 * @route POST /api/users/test-email
 * @access Public (only in development)
 */
const testSendEmail = asyncHandler(async (req, res) => {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
        res.status(404);
        throw createUserError(req.lang, 'TEST_EMAIL_DISABLED', 'errors.page_not_found');
    }

    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw createUserError(req.lang, 'TEST_EMAIL_EMAIL_REQUIRED', 'admin-controllers-messages.email_required');
    }

    // Generate a fake token for testing
    const testToken = 'test_token_1234567890abcdef';
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${testToken}`;

    try {
        await sendVerificationEmail(email, verificationUrl, req.lang);
        res.json({
            success: true,
            code: 'TEST_EMAIL_SENT',
            message: getMessage(req.lang, 'admin-controllers-messages.test_email_sent_successfully'),
            email,
            note: getMessage(req.lang, 'admin-controllers-messages.check_email_inbox_spam'),
        });
    } catch (error) {
        console.error('[TEST_EMAIL_SEND_ERROR]', error);
        res.status(500);
        throw createUserError(req.lang, 'TEST_EMAIL_SEND_FAILED', 'errors.generic_error');
    }
});

/**
 * Upload user avatar
 * @route PUT /api/users/avatar
 * @access Private
 */
const uploadUserAvatar = asyncHandler(async (req, res) => {
  const { deleteOldFile } = require('../utils/fileCleanup');
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'user.notFound'));
  }

  if (!req.file) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'admin-controllers-messages.no_file_uploaded'));
  }

  // Delete old avatar if it exists
  if (user.profileImage) {
    deleteOldFile(user.profileImage);
  }

  // Store relative path in DB with correct subfolder (users, admins, reviewers)
  // Path from multer includes destination folder (e.g., uploads/users/filename)
  let relativeUrl = req.file.path;

  // Ensure path starts with /
  if (!relativeUrl.startsWith('/')) {
    relativeUrl = '/' + relativeUrl;
  }

  user.profileImage = relativeUrl;
  const updatedUser = await user.save();

  res.json({
    success: true,
    message: getMessage(req.lang, 'admin-controllers-messages.avatar_uploaded_success'),
    profileImage: relativeUrl,
    user: {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      profileImage: relativeUrl,
    },
  });
});

/**
 * Redirect to Google OAuth login page
 * @route GET /api/users/auth/google
 * @access Public
 */
const googleAuth = (req, res) => {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const callbackURL = process.env.NODE_ENV === 'production'
    ? process.env.GOOGLE_CALLBACK_URL_PROD
    : process.env.GOOGLE_CALLBACK_URL_DEV;

  if (!clientID) {
    throw new Error('Google Client ID is not configured');
  }

  // Construct Google OAuth URL
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientID}&redirect_uri=${encodeURIComponent(callbackURL)}&response_type=code&scope=profile%20email&access_type=offline&prompt=consent`;

  // Redirect user to Google
  res.redirect(url);
};

/**
 * Handle Google OAuth callback
 * Exchanges code for tokens, creates/finds user, and issues JWT
 * @route GET /api/users/auth/google/callback
 * @access Public
 */
const googleAuthCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;
  if (!code) {
    res.status(400);
    throw new Error('Authorization code from Google is required');
  }

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.NODE_ENV === 'production'
    ? process.env.GOOGLE_CALLBACK_URL_PROD
    : process.env.GOOGLE_CALLBACK_URL_DEV;

  const client = new OAuth2Client(clientID, clientSecret, callbackURL);

  // Exchange code for tokens
  const { tokens } = await client.getToken(code);

  // Verify ID Token and get user payload
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientID,
  });
  const payload = ticket.getPayload();
  const { email, name, picture, sub: providerId } = payload;

  // Find user by email or providerId
  let user = await User.findOne({
    $or: [
      { email: email.toLowerCase() },
      { providerId, provider: 'google' }
    ]
  });

  if (user) {
    // Update existing user if needed
    if (user.provider === 'local') {
      user.provider = 'google';
      user.providerId = providerId;
    }
    user.lastLoginAt = new Date();
    user.lastLoginProvider = 'google';
    if (!user.profileImage && picture) {
      user.profileImage = picture;
    }
    await user.save();
  } else {
    // Create new user for Google login
    // Generate a secure random password (never used for login but needed by schema/security)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Math.floor(1000 + Math.random() * 9000);

    user = await User.create({
      username,
      email: email.toLowerCase(),
      name,
      password: randomPassword,
      profileImage: picture,
      provider: 'google',
      providerId,
      isEmailVerified: true, // Google accounts are pre-verified
      lastLoginAt: new Date(),
      lastLoginProvider: 'google',
    });
  }

  // Issue our system's tokens
  const { accessToken, refreshToken, refreshTokenId } = generateTokenPair(user._id);
  user.refreshTokenId = refreshTokenId;
  await user.save();

  // Set refresh token in httpOnly secure cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });

  // Redirect to frontend login page with accessToken
  // Frontend will detect the token, save it, and redirect to home
  const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendURL}/login?token=${accessToken}`);
});

/**
 * Tạo user mới bởi Admin
 * Admin có thể chỉ định role, username, email, và password
 * @route POST /api/users/admin/create
 * @access Private (Admin only)
 */
const createUserByAdmin = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const { email, username, password, role } = req.body;

  // Validate required fields
  if (!email || !username || !password) {
    res.status(400);
    throw new Error('Email, username, and password are required');
  }

  // Check if user already exists
  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) {
    res.status(400);
    throw new Error('User with this email or username already exists');
  }

  // Validate role
  const validRoles = ['user', 'admin', 'super-admin'];
  const userRole = role && validRoles.includes(role) ? role : 'user';

  // Create the user
  const user = await User.create({
    email,
    username,
    password,
    role: userRole,
    isEmailVerified: true, // Admin-created users are auto-verified
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      message: 'User created successfully by admin',
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
      }
    });
  } else {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.invalid_user_data'));
  }
});

module.exports = {
    authUser,
    registerUser,
    getUserProfile,
    updateUserProfile,
    uploadUserAvatar,
    getUsers,
    deleteUser,
    hardDeleteUser,
    restoreUser,
    getUserById,
    updateUser,
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
};
