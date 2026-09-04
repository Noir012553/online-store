/**
 * Mongoose Utilities
 * Provides helpers for database operations with timeouts
 * Prevents buffering issues and ensures operations fail gracefully
 */

/**
 * Wrap a database operation with a timeout
 * If operation takes longer than timeout, rejects with error
 * @param {Promise} operation - The database operation promise
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise} - Original operation or timeout error
 */
const configuredTimeout = Number(process.env.DB_OPERATION_TIMEOUT);
const DEFAULT_TIMEOUT = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 30000;

const withTimeout = (operation, timeoutMs = DEFAULT_TIMEOUT) => {
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_TIMEOUT;
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Database operation timed out after ${effectiveTimeout}ms`));
    }, effectiveTimeout);
  });

  const operationMaxTime = Number(operation?.options?.maxTimeMS);
  const databaseOperation = typeof operation?.maxTimeMS === 'function'
    ? operation.maxTimeMS(Number.isFinite(operationMaxTime)
      ? Math.min(operationMaxTime, effectiveTimeout)
      : effectiveTimeout)
    : operation;

  return Promise.race([databaseOperation, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
};

module.exports = {
  withTimeout,
  DEFAULT_TIMEOUT,
};
