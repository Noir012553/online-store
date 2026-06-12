/**
 * Utility to generate password reset tokens
 * Generates a secure random token and returns hashed version for DB storage
 */

const crypto = require('crypto');

/**
 * Generate a password reset token
 * @returns {Object} { token: plain token, hashedToken: hashed token, expires: expiry date }
 */
const generatePasswordResetToken = () => {
  // Generate random token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token for storing in database
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Token expires in 30 minutes
  const expires = new Date(Date.now() + 30 * 60 * 1000);

  return {
    token: resetToken,
    hashedToken,
    expires,
  };
};

module.exports = {
  generatePasswordResetToken,
};
