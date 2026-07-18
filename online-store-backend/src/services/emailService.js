/**
 * Email Service - Gửi email xác minh, reset password, etc.
 * Sử dụng Nodemailer hoặc service khác
 */

const nodemailer = require('nodemailer');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');

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
      return { message: 'Email disabled (dev mode)' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = getMessage(emailLang, 'email.verification');
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: msg.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">${msg.title}</h2>
          <p style="color: #666; font-size: 16px;">
            ${msg.thankYou}
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
            ${msg.linkText}<br/>
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

        ${msg.thankYou}

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
    throw new Error(`Failed to send verification email: ${error.message}`);
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
      return { message: 'Email disabled (dev mode)' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = getMessage(emailLang, 'email.resetPassword');
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
            ${msg.linkText}<br/>
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
    throw new Error(`Failed to send reset password email: ${error.message}`);
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
      return { message: 'Email disabled (dev mode)' };
    }

    const emailLang = lang || getDefaultLanguage().code.toUpperCase();
    const msg = getMessage(emailLang, 'email.otp');
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

        Mã OTP của bạn: ${otp}

        ${msg.expiry}
        ${msg.ignore}

        ${msg.copyright}
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
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
      return { message: 'Email disabled (dev mode)' };
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
    throw new Error(`Failed to send newsletter confirmation email: ${error.message}`);
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendOTPEmail,
  sendNewsletterConfirmationEmail,
};
