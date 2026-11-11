const jwt = require('jsonwebtoken');

const getSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

const createNewsletterUnsubscribeToken = (email) => jwt.sign({
  email: String(email).trim().toLowerCase(),
  purpose: 'newsletter-unsubscribe',
}, getSecret(), { algorithm: 'HS256' });

const verifyNewsletterUnsubscribeToken = (token) => {
  if (typeof token !== 'string' || token.length > 2048) return null;

  try {
    const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (payload.purpose !== 'newsletter-unsubscribe' || typeof payload.email !== 'string' || !payload.email) {
      return null;
    }
    return payload.email;
  } catch {
    return null;
  }
};

module.exports = {
  createNewsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
};
