/**
 * Email Service - Gửi email xác minh, reset password, etc.
 * Sử dụng Nodemailer hoặc service khác
 */

const nodemailer = require('nodemailer');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, getIntlLocale } = require('../config/languageInventory');

const createEmailDeliveryError = (code, cause) => {
  const error = new Error(code);
  error.code = code;
  error.cause = cause;
  return error;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getAuthEmailMessages = (lang, type) => {
  const keyPrefix = `auth-messages.email_${type}_`;
  const fields = type === 'verification'
    ? ['subject', 'title', 'thank_you', 'instruction', 'button', 'link_text', 'expiry', 'ignore']
    : ['subject', 'title', 'received', 'instruction', 'button', 'link_text', 'expiry', 'ignore'];

  return Object.fromEntries([
    ...fields.map((field) => [field, getMessage(lang, `${keyPrefix}${field}`)]),
    ['copyright', getMessage(lang, 'auth-messages.email_copyright')],
  ]);
};

/**
 * Email transporter configuration
 * Hỗ trợ nhiều providers: Gmail, SendGrid, AWS SES, etc.
 */
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    return null;
  }

  // ============= OPTION 1: Gmail (Recommended for testing) =============
  // Bước 1: Enable 2-Step Verification trên Gmail account
  // Bước 2: Tạo App Password: https://myaccount.google.com/apppasswords
  // Bước 3: Set .env variables:
  // EMAIL_HOST=smtp.gmail.com
  // EMAIL_PORT=587
  // EMAIL_USER=your-email@gmail.com
  // EMAIL_PASSWORD=your-app-password

  // ============= OPTION 2: SendGrid =============
  // 1. Đăng ký tài khoản: https://sendgrid.com
  // 2. Tạo API key
  // 3. Set .env:
  // SENDGRID_API_KEY=your-api-key
  // EMAIL_FROM=noreply@example.com

  // For now, using SMTP configuration (Gmail/custom SMTP)
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    // SendGrid as SMTP
    return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: 'apikey', // This is the literal string 'apikey'
            pass: process.env.SENDGRID_API_KEY
        }
    });
  }

  // Default: SMTP (Gmail, custom SMTP, etc.)
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Gửi email xác minh đến người dùng mới
 * @param {String} email - Email người nhận
 * @param {String} verificationUrl - URL xác minh với token
 * @param {String} lang - Language code (VI, EN, etc.) - defaults to 'VI'
 * @returns {Promise} Email sent result
 */
const sendVerificationEmail = async (email, verificationUrl, lang) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending but log the link
    if (!transporter) {
      return { code: 'EMAIL_DISABLED' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = getAuthEmailMessages(emailLang, 'verification');
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: msg.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">${msg.title}</h2>
          <p style="color: #666; font-size: 16px;">
            ${msg.thank_you}
          </p>
          <p style="color: #666; font-size: 16px;">
            ${msg.instruction}
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}"
               style="display: inline-block; padding: 12px 30px; background-color: #ef4444;
                      color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              ${msg.button}
            </a>
          </div>
          <p style="color: #999; font-size: 14px;">
            ${msg.link_text}<br/>
            <a href="${verificationUrl}" style="color: #ef4444;">${verificationUrl}</a>
          </p>
          <p style="color: #999; font-size: 14px; margin-top: 30px;">
            ${msg.expiry}<br/>
            ${msg.ignore}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            ${msg.copyright}
          </p>
        </div>
      `,
      text: `
        ${msg.title}

        ${msg.thank_you}

        ${msg.instruction}
        ${verificationUrl}

        ${msg.expiry}
        ${msg.ignore}

        ${msg.copyright}
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_VERIFICATION_SEND_FAILED', error);
  }
};

/**
 * Gửi email reset password
 * @param {String} email - Email người nhận
 * @param {String} resetUrl - URL reset password với token
 * @param {String} lang - Language code (VI, EN, etc.) - defaults to 'VI'
 * @returns {Promise} Email sent result
 */
const sendResetPasswordEmail = async (email, resetUrl, lang) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending but log the link
    if (!transporter) {
      return { code: 'EMAIL_DISABLED' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = getAuthEmailMessages(emailLang, 'reset_password');
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: msg.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">${msg.title}</h2>
          <p style="color: #666; font-size: 16px;">
            ${msg.received}
          </p>
          <p style="color: #666; font-size: 16px;">
            ${msg.instruction}
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="display: inline-block; padding: 12px 30px; background-color: #ef4444;
                      color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              ${msg.button}
            </a>
          </div>
          <p style="color: #999; font-size: 14px;">
            ${msg.link_text}<br/>
            <a href="${resetUrl}" style="color: #ef4444;">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 14px; margin-top: 30px;">
            ${msg.expiry}<br/>
            ${msg.ignore}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            ${msg.copyright}
          </p>
        </div>
      `,
      text: `
        ${msg.title}

        ${msg.received}

        ${msg.instruction}
        ${resetUrl}

        ${msg.expiry}
        ${msg.ignore}

        ${msg.copyright}
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_PASSWORD_RESET_SEND_FAILED', error);
  }
};

/**
 * Gửi email chứa OTP (để tương lai nếu implement 2FA)
 * @param {String} email - Email người nhận
 * @param {String} otp - One-time password
 * @param {String} lang - Language code (VI, EN, etc.) - defaults to 'VI'
 * @returns {Promise} Email sent result
 */
const sendOTPEmail = async (email, otp, lang) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending but log the OTP
    if (!transporter) {
      return { code: 'EMAIL_DISABLED' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = {
      subject: getMessage(emailLang, 'auth-messages.email_otp_subject'),
      title: getMessage(emailLang, 'auth-messages.email_otp_title'),
      description: getMessage(emailLang, 'auth-messages.email_otp_description'),
      expiry: getMessage(emailLang, 'auth-messages.email_otp_expiry'),
      ignore: getMessage(emailLang, 'auth-messages.email_otp_ignore'),
      copyright: getMessage(emailLang, 'auth-messages.email_copyright'),
      text: getMessage(emailLang, 'auth-messages.email_otp_text', { otp }),
    };
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: msg.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">${msg.title}</h2>
          <p style="color: #666; font-size: 16px;">
            ${msg.description}
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #ef4444; letter-spacing: 5px;">
              ${otp}
            </div>
          </div>
          <p style="color: #999; font-size: 14px;">
            ${msg.expiry}<br/>
            ${msg.ignore}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            ${msg.copyright}
          </p>
        </div>
      `,
      text: `
        ${msg.title}

        ${msg.description}

        ${msg.text}

        ${msg.expiry}
        ${msg.ignore}

        ${msg.copyright}
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_OTP_SEND_FAILED', error);
  }
};

/**
 * Gửi email cảm ơn + hứa hẹn ưu đãi cho newsletter subscriber
 * @param {String} email - Email người nhận
 * @param {String} lang - Language code (VI, EN, etc.) - defaults to 'VI'
 * @returns {Promise} Email sent result
 */
const sendNewsletterConfirmationEmail = async (email, lang) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending
    if (!transporter) {
      return { code: 'EMAIL_DISABLED' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = getMessage(emailLang, 'email.newsletter');
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: msg.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; padding: 20px 0; border-bottom: 3px solid #ef4444;">
            <h1 style="color: #ef4444; margin: 0; font-size: 28px;">LaptopStore</h1>
          </div>

          <div style="padding: 30px 0;">
            <h2 style="color: #333; text-align: center; margin-bottom: 20px;">
              ${msg.title}
            </h2>

            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 15px;">
              ${msg.greeting}
            </p>

            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 15px;">
              ${msg.thankYou}
            </p>

            <div style="background-color: #f8f8f8; border-left: 4px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="color: #ef4444; margin-top: 0;">
                ✨ ${msg.promises}
              </h3>
              <ul style="color: #666; font-size: 15px; line-height: 1.8; margin: 10px 0; padding-left: 20px;">
                <li>${msg.promise1}</li>
                <li>${msg.promise2}</li>
                <li>${msg.promise3}</li>
                <li>${msg.promise4}</li>
              </ul>
            </div>

            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 15px;">
              ${msg.content}
            </p>

            <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              ${msg.unsubscribe}
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee; margin-top: 40px;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              ${msg.copyright}
            </p>
            <p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">
              📧 ${email}
            </p>
          </div>
        </div>
      `,
      text: `
        ${msg.title}

        ${msg.greeting}

        ${msg.thankYou}

        ${msg.promises}:
        ${msg.promise1}
        ${msg.promise2}
        ${msg.promise3}
        ${msg.promise4}

        ${msg.content}

        ${msg.unsubscribe}

        ${msg.copyright}
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_NEWSLETTER_SEND_FAILED', error);
  }
};

const sendOrderPaymentSuccessEmail = async (order, lang) => {
  try {
    const recipient = order?.customer?.email || order?.user?.email;
    if (!recipient) {
      return { code: 'EMAIL_RECIPIENT_MISSING' };
    }

    const transporter = createTransporter();
    if (!transporter) {
      return { code: 'EMAIL_DISABLED' };
    }

    const emailLang = (lang || getDefaultLanguage().code).toLowerCase();
    const orderId = String(order._id || order.id || '');
    const customerName = order?.customer?.name || order?.user?.name || '';
    const currencyCode = order.currencyCode || 'VND';
    const formattedTotal = new Intl.NumberFormat(getIntlLocale(emailLang), {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: currencyCode === 'VND' ? 0 : undefined,
      maximumFractionDigits: currencyCode === 'VND' ? 0 : undefined,
    }).format(Number(order.totalPrice) || 0);
    const itemCount = (order.orderItems || []).reduce((total, item) => total + (Number(item.qty) || 0), 0);
    const messagePath = 'email.paymentSuccess';
    const message = (key) => getMessage(emailLang, `${messagePath}.${key}`, {
      orderId,
      customerName,
    });
    const subject = message('subject');
    const title = message('title');
    const greeting = message('greeting');
    const body = message('body');
    const orderLabel = message('orderLabel');
    const totalLabel = message('totalLabel');
    const itemsLabel = message('itemsLabel');
    const thanks = message('thanks');
    const itemRows = (order.orderItems || []).map((item) => {
      const itemName = typeof item.name === 'object'
        ? item.name[emailLang] || Object.values(item.name).find(Boolean) || ''
        : item.name;
      return `<li>${escapeHtml(itemName)} × ${Number(item.qty) || 0}</li>`;
    }).join('');

    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: recipient,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; padding: 20px 0; border-bottom: 3px solid #ef4444;">
            <h1 style="color: #ef4444; margin: 0;">LaptopStore</h1>
          </div>
          <div style="padding: 24px 0;">
            <h2 style="color: #333;">${escapeHtml(title)}</h2>
            <p>${escapeHtml(greeting)}</p>
            <p>${escapeHtml(body)}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px 0;">${escapeHtml(orderLabel)}</td><td style="padding: 8px 0; text-align: right;">${escapeHtml(orderId)}</td></tr>
              <tr><td style="padding: 8px 0;">${escapeHtml(totalLabel)}</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${escapeHtml(formattedTotal)}</td></tr>
              <tr><td style="padding: 8px 0;">${escapeHtml(itemsLabel)}</td><td style="padding: 8px 0; text-align: right;">${itemCount}</td></tr>
            </table>
            ${itemRows ? `<p>${escapeHtml(itemsLabel)}:</p><ul>${itemRows}</ul>` : ''}
            <p>${escapeHtml(thanks)}</p>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #eee; padding-top: 16px;">${escapeHtml(getMessage(emailLang, 'email.copyright'))}</p>
        </div>
      `,
      text: [
        title,
        greeting,
        body,
        `${orderLabel}: ${orderId}`,
        `${totalLabel}: ${formattedTotal}`,
        `${itemsLabel}: ${itemCount}`,
        thanks,
      ].join('\n\n'),
    });

    return result;
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_PAYMENT_SUCCESS_SEND_FAILED', error);
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendOTPEmail,
  sendNewsletterConfirmationEmail,
  sendOrderPaymentSuccessEmail,
};
