/**
 * Newsletter Controller
 * Xử lý đăng ký newsletter, gửi email cảm ơn
 */

const asyncHandler = require('express-async-handler');
const Newsletter = require('../models/Newsletter');
const emailService = require('../services/emailService');
const { getMessage } = require('../i18n/messages');
const { verifyNewsletterUnsubscribeToken } = require('../utils/newsletterUnsubscribeToken');

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const renderUnsubscribePage = (lang, message, token, buttonLabel) => `
    <!doctype html>
    <html lang="${escapeHtml(lang)}">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LaptopStore</title></head>
      <body>
        <main>
          <h1>LaptopStore</h1>
          <p>${escapeHtml(message)}</p>
          ${token ? `<form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">${escapeHtml(buttonLabel)}</button></form>` : ''}
        </main>
      </body>
    </html>
`;

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
            message: getMessage(req.lang, 'admin-controllers-messages.email_phone_required'),
        });
    }

    // Check if already subscribed
    const existingSubscriber = await Newsletter.findOne({
        email: email.toLowerCase(),
        status: 'active',
    });

    const subscriber = existingSubscriber || await Newsletter.findOneAndUpdate(
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

    try {
        await emailService.sendNewsletterConfirmationEmail(email, req.lang);
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[NEWSLETTER] Failed to send confirmation email to ${email}:`, error.message);
        }
        return res.status(503).json({
            success: false,
            message: getMessage(req.lang, 'admin-controllers-messages.newsletter_email_delivery_failed'),
        });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[NEWSLETTER] Confirmation email sent to ${email}`);
    }

    res.status(existingSubscriber ? 200 : 201).json({
        success: true,
        message: getMessage(req.lang, 'admin-controllers-messages.newsletter_subscription_thanks'),
        subscriber: {
            _id: subscriber._id,
            email: subscriber.email,
            phone: subscriber.phone,
            status: subscriber.status,
            subscribedAt: subscriber.createdAt,
        },
    });
});

const showUnsubscribeConfirmation = asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = verifyNewsletterUnsubscribeToken(token);
    const lang = typeof req.query.lang === 'string' ? req.query.lang : req.lang;
    const pageUrl = new URL('/newsletter/unsubscribe', process.env.FRONTEND_URL || 'https://manln.online');

    if (token) pageUrl.searchParams.set('token', token);
    if (lang) pageUrl.searchParams.set('lang', lang);
    if (!email) pageUrl.searchParams.set('invalid', '1');

    res.redirect(pageUrl.toString());
});

const unsubscribe = asyncHandler(async (req, res) => {
    const email = verifyNewsletterUnsubscribeToken(req.body?.token || req.query.token);
    const isFormRequest = req.is('application/x-www-form-urlencoded');

    if (!email) {
        const message = getMessage(req.lang, 'email.newsletter.unsubscribeInvalid');
        if (isFormRequest) {
            return res.status(400).type('html').send(renderUnsubscribePage(req.lang, message));
        }
        return res.status(400).json({ success: false, message });
    }

    await Newsletter.updateOne(
        { email, status: 'active' },
        { $set: { status: 'unsubscribed' } }
    );

    const message = getMessage(req.lang, 'email.newsletter.unsubscribeComplete');
    if (isFormRequest) {
        return res.type('html').send(renderUnsubscribePage(req.lang, message));
    }

    res.json({ success: true, message });
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
    showUnsubscribeConfirmation,
    unsubscribe,
    getSubscribers,
};
