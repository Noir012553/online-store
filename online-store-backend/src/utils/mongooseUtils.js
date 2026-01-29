/**
 * Mongoose Utilities
 * Provides helpers for database operations with timeouts
 * Prevents buffering issues and ensures operations fail gracefully
 */

/**
 * Wrap a database operation with a timeout
 * If operation takes longer than timeout, rejects with error
 * @param {Promise} operation - The database operation promise
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @returns {Promise} - Original operation or timeout error
 */
const DEFAULT_TIMEOUT = parseInt(process.env.DB_OPERATION_TIMEOUT || '15000', 10);

const withTimeout = (operation, timeoutMs = DEFAULT_TIMEOUT) => {
  return Promise.race([
    operation,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

module.exports = {
  withTimeout,
  DEFAULT_TIMEOUT,
};
