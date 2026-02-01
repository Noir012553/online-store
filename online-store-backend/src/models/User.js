const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Schema cho người dùng hệ thống
 *
 * @field {String} username - Tên đăng nhập (duy nhất, bắt buộc)
 * @field {String} name - Tên hiển thị người dùng (dùng cho review, profile, etc.)
 * @field {String} email - Email (duy nhất, bắt buộc, lowercase)
 * @field {String} password - Mật khẩu (được mã hóa với bcrypt)
 * @field {String} role - Vai trò: 'user' (mặc định) / 'admin' / 'super-admin'
 * @field {String} profileImage - URL hình ảnh avatar/profile người dùng (không bắt buộc)
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {isDeleted} - Filter soft-deleted users
 *
 * @hook pre('save') - Mã hóa mật khẩu trước khi lưu (nếu có thay đổi)
 * @method matchPassword - So sánh mật khẩu nhập với mật khẩu đã lưu
 */
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        default: null,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        // Không bắt buộc nếu đăng nhập bằng OAuth (Google, etc.)
        // Kiểm tra trong controller: mật khẩu bắt buộc nếu provider = 'local'
        default: null
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'super-admin'],
        default: 'user'
    },
    profileImage: {
        type: String,
        default: null
    },
    // OAuth Provider fields
    provider: {
        type: String,
        enum: ['local', 'google', 'facebook', 'github'],
        default: 'local'
    },
    googleId: {
        type: String,
        default: null,
        sparse: true,  // Cho phép null values và unique index
        unique: true   // Đảm bảo mỗi Google ID chỉ có 1 user
    },
    googleEmail: {
        type: String,
        default: null
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    lastLoginProvider: {
        type: String,
        default: null
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    passwordResetToken: {
        type: String,
        default: null
    },
    passwordResetExpire: {
        type: Date,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null
    },
    emailVerificationExpire: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

/**
 * Pre-save hook: Mã hóa mật khẩu nếu có thay đổi
 * Sử dụng bcrypt với salt round = 10
 */
UserSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Instance method: So sánh mật khẩu nhập với mật khẩu đã lưu
 * @param {String} enteredPassword - Mật khẩu nhập vào
 * @returns {Promise<Boolean>} true nếu khớp, false nếu không
 */
UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
