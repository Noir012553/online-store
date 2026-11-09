const asyncHandler = require('express-async-handler');
const emailService = require('../services/emailService');

const isText = (value, maxLength) => typeof value === 'string'
  && value.trim().length > 0
  && value.trim().length <= maxLength;

const submit = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedSubject = typeof subject === 'string' ? subject.trim() : '';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';

  if (!isText(normalizedName, 100)
    || /[\r\n]/.test(normalizedName)
    || !isText(normalizedEmail, 254)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || !isText(normalizedPhone, 30)
    || !/^[+()\d .-]+$/.test(normalizedPhone)
    || normalizedPhone.replace(/\D/g, '').length < 7
    || !isText(normalizedSubject, 160)
    || /[\r\n]/.test(normalizedSubject)
    || !isText(normalizedMessage, 5000)) {
    return res.status(400).json({ success: false, code: 'CONTACT_FORM_INVALID' });
  }

  try {
    await emailService.sendContactEmails({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      subject: normalizedSubject,
      message: normalizedMessage,
    }, req.lang);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CONTACT_FORM_EMAIL_FAILED]', { code: error.code || 'UNKNOWN' });
    }
    return res.status(503).json({ success: false, code: 'CONTACT_EMAIL_UNAVAILABLE' });
  }

  return res.status(202).json({ success: true });
});

module.exports = { submit };
