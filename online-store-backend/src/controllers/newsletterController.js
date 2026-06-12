/**
 * Newsletter Controller
 * Xử lý đăng ký newsletter, gửi email cảm ơn
 */

const asyncHandler = require('express-async-handler');
const Newsletter = require('../models/Newsletter');
const { sendNewsletterConfirmationEmail } = require('../services/emailService');

/**
 * POST /api/newsletter
 * Đăng ký newsletter
 * 
 * Body:
 * {
 *   "email": "user@example.com",
 *   "phone": "0901234567"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Cảm ơn bạn đã đăng ký!",
 *   "subscriber": { _id, email, phone, status, createdAt }
 * }
 */
const subscribe = asyncHandler(async (req, res) => {
    const { email, phone } = req.body;

    // Validation
    if (!email || !phone) {
        return res.status(400).json({
            success: false,
            message: 'Email and phone are required',
        });
    }

    // Check if already subscribed
    const existingSubscriber = await Newsletter.findOne({
        email: email.toLowerCase(),
        status: 'active',
    });

    if (existingSubscriber) {
        return res.status(400).json({
            success: false,
            message: 'Email đã được đăng ký newsletter',
        });
    }

    // Create or update subscriber
    let subscriber = await Newsletter.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
            email: email.toLowerCase(),
            phone,
            status: 'active',
        },
        {
            returnDocument: 'after',
            upsert: true,
            runValidators: true,
        }
    );

    // Send confirmation email
    try {
        await sendNewsletterConfirmationEmail(email);
        console.log(`[NEWSLETTER] Confirmation email sent to ${email}`);
    } catch (error) {
        console.error(`[NEWSLETTER] Failed to send confirmation email to ${email}:`, error.message);
        // Don't fail the subscription if email fails
        // Customer is subscribed even if email send fails
    }

    res.status(201).json({
        success: true,
        message: 'Cảm ơn bạn đã đăng ký! Chúng tôi sẽ gửi ưu đãi độc quyền tới email của bạn.',
        subscriber: {
            _id: subscriber._id,
            email: subscriber.email,
            phone: subscriber.phone,
            status: subscriber.status,
            subscribedAt: subscriber.createdAt,
        },
    });
});

/**
 * POST /api/newsletter/unsubscribe
 * Hủy đăng ký newsletter
 * 
 * Body:
 * {
 *   "email": "user@example.com"
 * }
 */
const unsubscribe = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required',
        });
    }

    const subscriber = await Newsletter.findOneAndUpdate(
        { email: email.toLowerCase() },
        { status: 'unsubscribed' },
        { returnDocument: 'after' }
    );

    if (!subscriber) {
        return res.status(404).json({
            success: false,
            message: 'Subscriber not found',
        });
    }

    res.json({
        success: true,
        message: 'Bạn đã hủy đăng ký newsletter',
    });
});

/**
 * GET /api/newsletter/subscribers (Admin only)
 * Lấy danh sách subscribers
 */
const getSubscribers = asyncHandler(async (req, res) => {
    const { status = 'active', page = 1, limit = 50 } = req.query;

    const query = {};
    if (status) {
        query.status = status;
    }

    const skip = (page - 1) * limit;
    const subscribers = await Newsletter.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

    const total = await Newsletter.countDocuments(query);

    res.json({
        success: true,
        data: subscribers,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
        },
    });
});

module.exports = {
    subscribe,
    unsubscribe,
    getSubscribers,
};