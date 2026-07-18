/**
 * Simple in-memory cache for dashboard analytics
 * Prevents excessive database queries for frequently accessed data
 */

const cache = new Map();

/**
 * Cache configuration for different analytics endpoints
 * TTL: Time To Live in milliseconds
 */
const CACHE_CONFIG = {
  dashboardStats: { ttl: 5 * 60 * 1000 }, // 5 minutes
  revenueTimeline: { ttl: 10 * 60 * 1000 }, // 10 minutes
  orderStatus: { ttl: 10 * 60 * 1000 }, // 10 minutes
  topProducts: { ttl: 15 * 60 * 1000 }, // 15 minutes
  dashboardData: { ttl: 5 * 60 * 1000 }, // 5 minutes
};

/**
 * Generate cache key from endpoint and query parameters
 */
function generateCacheKey(endpoint, params = {}) {
  const paramStr = Object.entries(params)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${endpoint}${paramStr ? ':' + paramStr : ''}`;
}

/**
 * Get cached data
 * Returns null if cache miss or expired
 */
function getCache(endpoint, params = {}) {
  const key = generateCacheKey(endpoint, params);
  const cached = cache.get(key);

  if (!cached) {
    return null;
  }

  // Check if expired
  if (Date.now() > cached.expireAt) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

/**
 * Set cache data with TTL
 */
function setCache(endpoint, data, params = {}) {
  const key = generateCacheKey(endpoint, params);
  const config = CACHE_CONFIG[endpoint] || { ttl: 5 * 60 * 1000 };

  cache.set(key, {
    data,
    expireAt: Date.now() + config.ttl,
  });
}

/**
 * Clear specific cache or all cache
 */
function clearCache(endpoint = null) {
  if (endpoint === null) {
    cache.clear();
  } else {
    // Clear all entries for a specific endpoint
    const keysToDelete = Array.from(cache.keys()).filter((key) =>
      key.startsWith(endpoint)
    );
    keysToDelete.forEach((key) => cache.delete(key));
  }
}

/**
 * Middleware-like function to cache async operations
 */
async function withCache(endpoint, params, asyncFn) {
  // Try to get from cache
  const cached = getCache(endpoint, params);
  if (cached !== null) {
    return cached;
  }

  // Execute async function
  const result = await asyncFn();

  // Store in cache
  setCache(endpoint, result, params);

  return result;
}

module.exports = {
  getCache,
  setCache,
  clearCache,
  withCache,
  generateCacheKey,
};
