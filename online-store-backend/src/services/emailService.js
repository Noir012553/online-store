/**
 * Email Service - Gửi email xác minh, reset password, etc.
 * Sử dụng Nodemailer hoặc service khác
 */

const fs = require('fs');
const path = require('path');
const juice = require('juice');
const nodemailer = require('nodemailer');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, getIntlLocale } = require('../config/languageInventory');
const { createNewsletterUnsubscribeToken } = require('../utils/newsletterUnsubscribeToken');

const emailStyles = fs.readFileSync(path.join(__dirname, '../email/email.css'), 'utf8');
const inlineEmailStyles = (html) => juice.inlineContent(html, emailStyles);

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
      html: inlineEmailStyles(`
        <div class="email-shell">
          <h2 class="email-title">${msg.title}</h2>
          <p class="email-copy">${msg.thank_you}</p>
          <p class="email-copy">${msg.instruction}</p>
          <div class="email-center">
            <a href="${verificationUrl}" class="email-button">${msg.button}</a>
          </div>
          <p class="email-muted">
            ${msg.link_text}<br/>
            <a href="${verificationUrl}" class="email-link">${verificationUrl}</a>
          </p>
          <p class="email-muted email-expiry">
            ${msg.expiry}<br/>
            ${msg.ignore}
          </p>
          <hr class="email-rule">
          <p class="email-copyright">${msg.copyright}</p>
        </div>
      `),
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
      html: inlineEmailStyles(`
        <div class="email-shell">
          <h2 class="email-title">${msg.title}</h2>
          <p class="email-copy">${msg.received}</p>
          <p class="email-copy">${msg.instruction}</p>
          <div class="email-center">
            <a href="${resetUrl}" class="email-button">${msg.button}</a>
          </div>
          <p class="email-muted">
            ${msg.link_text}<br/>
            <a href="${resetUrl}" class="email-link">${resetUrl}</a>
          </p>
          <p class="email-muted email-expiry">
            ${msg.expiry}<br/>
            ${msg.ignore}
          </p>
          <hr class="email-rule">
          <p class="email-copyright">${msg.copyright}</p>
        </div>
      `),
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
      html: inlineEmailStyles(`
        <div class="email-shell">
          <h2 class="email-title">${msg.title}</h2>
          <p class="email-copy">${msg.description}</p>
          <div class="email-center">
            <div class="email-otp">${otp}</div>
          </div>
          <p class="email-muted">
            ${msg.expiry}<br/>
            ${msg.ignore}
          </p>
          <hr class="email-rule">
          <p class="email-copyright">${msg.copyright}</p>
        </div>
      `),
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

    if (!transporter) {
      throw createEmailDeliveryError('EMAIL_DISABLED');
    }

    const emailLang = (lang || getDefaultLanguage().code).toLowerCase();
    const msg = getMessage(emailLang, 'email.newsletter');
    const copyright = getMessage(emailLang, 'email.copyright');
    const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const unsubscribeUrl = new URL('/api/newsletter/unsubscribe', baseUrl);
    unsubscribeUrl.searchParams.set('token', createNewsletterUnsubscribeToken(email));
    unsubscribeUrl.searchParams.set('lang', emailLang);
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: msg.subject,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl.toString()}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: inlineEmailStyles(`
        <div class="email-shell email-shell-body">
          <div class="email-brand-header">
            <h1 class="email-brand">LaptopStore</h1>
          </div>
          <div class="email-content">
            <h2 class="email-content-title">${escapeHtml(msg.title)}</h2>
            <p class="email-content-copy">${escapeHtml(msg.message)}</p>
            <p class="email-unsubscribe"><a class="email-link" href="${unsubscribeUrl.href}">${escapeHtml(msg.unsubscribe)}</a></p>
          </div>
          <div class="email-footer">
            <p class="email-footer-copy">${escapeHtml(copyright)}</p>
            <p class="email-footer-address">📧 ${escapeHtml(email)}</p>
          </div>
        </div>
      `),
      text: [msg.title, msg.message, `${msg.unsubscribe}: ${unsubscribeUrl}`, `Email: ${email}`, copyright].join('\n\n'),
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_NEWSLETTER_SEND_FAILED', error);
  }
};

const sendContactEmails = async ({ name, email, phone, subject, message }, lang) => {
  const emailLang = (lang || getDefaultLanguage().code).toLowerCase();
  const recipient = process.env.CONTACT_SUPPORT_EMAIL || getMessage(emailLang, 'contact.contact_email');
  const transporter = createTransporter();
  if (!recipient || !transporter) {
    throw createEmailDeliveryError('EMAIL_CONTACT_NOT_CONFIGURED');
  }

  try {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    await transporter.sendMail({
      from,
      to: recipient,
      replyTo: { name, address: email },
      subject: `[Contact] ${subject}`,
      text: [`Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`, `Subject: ${subject}`, '', message].join('\n'),
      html: `
        <h2>New contact form message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    });

    const confirmation = {
      subject: getMessage(emailLang, 'contact.email_confirmation_subject'),
      title: getMessage(emailLang, 'contact.email_confirmation_title'),
      greeting: getMessage(emailLang, 'contact.email_confirmation_greeting', { name }),
      received: getMessage(emailLang, 'contact.email_confirmation_received'),
      response: getMessage(emailLang, 'contact.email_confirmation_response'),
    };
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: confirmation.subject,
        text: [confirmation.greeting, confirmation.received, confirmation.response].join('\n\n'),
        html: inlineEmailStyles(`
          <div class="email-shell email-shell-body">
            <h2 class="email-title">${escapeHtml(confirmation.title)}</h2>
            <p class="email-copy">${escapeHtml(confirmation.greeting)}</p>
            <p class="email-copy">${escapeHtml(confirmation.received)}</p>
            <p class="email-copy">${escapeHtml(confirmation.response)}</p>
          </div>
        `),
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[CONTACT_CONFIRMATION_EMAIL_FAILED]', { code: error.code || 'UNKNOWN' });
      }
    }
  } catch (error) {
    throw createEmailDeliveryError('EMAIL_CONTACT_SEND_FAILED', error);
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
      html: inlineEmailStyles(`
        <div class="email-shell email-shell-body">
          <div class="email-brand-header">
            <h1 class="email-order-brand">LaptopStore</h1>
          </div>
          <div class="email-order-content">
            <h2 class="email-order-title">${escapeHtml(title)}</h2>
            <p>${escapeHtml(greeting)}</p>
            <p>${escapeHtml(body)}</p>
            <table class="email-order-table">
              <tr><td class="email-order-cell">${escapeHtml(orderLabel)}</td><td class="email-order-cell-right">${escapeHtml(orderId)}</td></tr>
              <tr><td class="email-order-cell">${escapeHtml(totalLabel)}</td><td class="email-order-cell-right email-order-total">${escapeHtml(formattedTotal)}</td></tr>
              <tr><td class="email-order-cell">${escapeHtml(itemsLabel)}</td><td class="email-order-cell-right">${itemCount}</td></tr>
            </table>
            ${itemRows ? `<p>${escapeHtml(itemsLabel)}:</p><ul>${itemRows}</ul>` : ''}
            <p>${escapeHtml(thanks)}</p>
          </div>
          <p class="email-order-copyright">${escapeHtml(getMessage(emailLang, 'email.copyright'))}</p>
        </div>
      `),
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
  sendContactEmails,
  sendOrderPaymentSuccessEmail,
};
