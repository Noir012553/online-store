/**
 * Newsletter Subscription Model
 * Lưu trữ email và số điện thoại của khách hàng đăng ký newsletter
 * Được sử dụng để gửi thông báo ưu đãi, cập nhật sản phẩm
 */

const mongoose = require('mongoose');

/**
 * Schema cho newsletter subscription
 * 
 * @field {String} email - Email khách hàng (bắt buộc, unique)
 * @field {String} phone - Số điện thoại khách hàng (bắt buộc)
 * @field {String} status - Trạng thái: 'active', 'unsubscribed' (mặc định: 'active')
 * @field {Date} subscribedAt - Thời điểm đăng ký (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 * 
 * @index {email} - Tìm subscription theo email để tránh trùng lặp
 */
const NewsletterSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    phone: {
        type: String,
        required: [true, 'Phone is required'],
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'unsubscribed'],
        default: 'active',
    },
}, {
    timestamps: true,
});

// Indexes để tối ưu query
NewsletterSchema.index({ phone: 1 });

// Partial unique index: email unique only for active subscribers
NewsletterSchema.index(
    { email: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: { status: 'active' }
    }
);

const Newsletter = mongoose.model('Newsletter', NewsletterSchema);

module.exports = Newsletter;
