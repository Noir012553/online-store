/**
 * Translation Cache Service
 * Simple in-memory cache với TTL (Time-To-Live)
 * Caches fallback endpoint responses + health check responses
 */

const CACHE_TTL = 3600 * 1000; // 1 hour in milliseconds
const cache = new Map();

class TranslationCacheService {
  /**
   * Generate cache key
   */
  static getCacheKey(type, lang, namespace = null) {
    if (type === 'fallback') {
      return `fallback_${lang}_${namespace}`;
    } else if (type === 'health') {
      return `health_${lang}`;
    }
    return null;
  }

  /**
   * Get from cache
   */
  static get(type, lang, namespace = null) {
    const key = this.getCacheKey(type, lang, namespace);
    if (!key) return null;

    const cached = cache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      cache.delete(key);
      console.log(`[TranslationCacheService] Cache expired: ${key}`);
      return null;
    }

    console.log(`[TranslationCacheService] Cache hit: ${key}`);
    return cached.value;
  }

  /**
   * Set to cache
   */
  static set(type, lang, value, namespace = null) {
    const key = this.getCacheKey(type, lang, namespace);
    if (!key) return;

    cache.set(key, {
      value,
      expiresAt: Date.now() + CACHE_TTL,
    });
    console.log(`[TranslationCacheService] Cache set: ${key} (TTL: 1h)`);
  }

  /**
   * Invalidate specific cache entry
   */
  static invalidate(type, lang, namespace = null) {
    const key = this.getCacheKey(type, lang, namespace);
    if (!key) return;

    if (cache.has(key)) {
      cache.delete(key);
      console.log(`[TranslationCacheService] Cache invalidated: ${key}`);
    }
  }

  /**
   * Invalidate all cache for a language
   */
  static invalidateLanguage(lang) {
    let count = 0;
    for (const [key] of cache) {
      if (key.includes(`_${lang}_`) || key.includes(`_${lang}`)) {
        cache.delete(key);
        count++;
      }
    }
    console.log(`[TranslationCacheService] Invalidated ${count} entries for lang: ${lang}`);
  }

  /**
   * Invalidate all cache
   */
  static invalidateAll() {
    const size = cache.size;
    cache.clear();
    console.log(`[TranslationCacheService] Cleared all cache (${size} entries)`);
  }

  /**
   * Get cache stats
   */
  static getStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const [key, cached] of cache) {
      if (now > cached.expiresAt) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: cache.size,
      valid,
      expired,
      ttl: CACHE_TTL / 1000 / 60 + 'min',
    };
  }
}

module.exports = TranslationCacheService;
