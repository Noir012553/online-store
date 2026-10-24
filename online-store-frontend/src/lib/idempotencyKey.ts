/**
 * Idempotency Key Management
 * Prevents duplicate API requests and duplicate order creation
 *
 * Usage:
 * const key = generateIdempotencyKey();
 * await apiCall('/orders', {
 *   method: 'POST',
 *   body: JSON.stringify({ ...data, idempotencyKey: key })
 * });
 */

/**
 * Generate a unique idempotency key
 * Format: uuid4-like string
 */
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Store idempotency key in sessionStorage to prevent duplicates in case of page reload
 * @param key - The idempotency key
 * @param context - Context name (e.g., 'order_creation', 'payment')
 */
export function storeIdempotencyKey(key: string, context: string): void {
  try {
    sessionStorage.setItem(`idempotency_${context}`, key);
  } catch (error) {
    // Silent fail - sessionStorage might not be available
  }
}

/**
 * Retrieve stored idempotency key (for retry logic)
 * @param context - Context name
 * @returns The stored key or null
 */
export function getStoredIdempotencyKey(context: string): string | null {
  try {
    return sessionStorage.getItem(`idempotency_${context}`);
  } catch (error) {
    return null;
  }
}

/**
 * Clear stored idempotency key after successful operation
 * @param context - Context name
 */
export function clearIdempotencyKey(context: string): void {
  try {
    sessionStorage.removeItem(`idempotency_${context}`);
  } catch (error) {
    // Silent fail - sessionStorage might not be available
  }
}

/**
 * Check if we already have a pending request with this key
 * (useful for preventing race conditions on page reload)
 */
export function hasPendingIdempotencyKey(context: string): boolean {
  return !!getStoredIdempotencyKey(context);
}
