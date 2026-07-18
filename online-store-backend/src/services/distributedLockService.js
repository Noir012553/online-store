const redis = require('redis');

class DistributedLockService {
  constructor() {
    this.client = null;
    this.locks = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = redis.createClient({
        url: redisUrl,
        password: process.env.REDIS_PASSWORD || undefined,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        },
      });

      this.client.on('error', (err) => {
        console.error('[DistributedLock] Redis error:', err.message);
      });

      await this.client.connect();
      this.initialized = true;
      console.log('[DistributedLock] ✅ Redis connected');
    } catch (error) {
      console.warn('[DistributedLock] ⚠️ Redis not available, using in-memory fallback');
      this.useMemoryFallback = true;
    }
  }

  async acquireLock(key, ttlSeconds = 60) {
    if (!this.initialized) {
      await this.initialize();
    }

    const lockId = `${key}:${Date.now()}:${Math.random()}`;

    try {
      if (this.useMemoryFallback) {
        if (this.locks.has(key)) {
          return null;
        }
        this.locks.set(key, { lockId, expiresAt: Date.now() + ttlSeconds * 1000 });
        return lockId;
      }

      const isLocked = await this.client.set(
        `lock:${key}`,
        lockId,
        {
          EX: ttlSeconds,
          NX: true,
        }
      );

      if (isLocked) {
        console.log(`[DistributedLock] 🔒 Acquired lock: ${key}`);
        return lockId;
      }

      return null;
    } catch (error) {
      console.error(`[DistributedLock] Error acquiring lock ${key}:`, error.message);
      return null;
    }
  }

  async releaseLock(key, lockId) {
    if (!this.initialized) {
      return false;
    }

    try {
      if (this.useMemoryFallback) {
        const lock = this.locks.get(key);
        if (lock && lock.lockId === lockId) {
          this.locks.delete(key);
          return true;
        }
        return false;
      }

      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.client.eval(script, {
        keys: [`lock:${key}`],
        arguments: [lockId],
      });

      if (result === 1) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DistributedLock] 🔓 Released lock: ${key}`);
        }
        return true;
      }

      return false;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[DistributedLock] Error releasing lock ${key}:`, error.message);
      }
      return false;
    }
  }

  async withLock(key, fn, ttlSeconds = 60) {
    const lockId = await this.acquireLock(key, ttlSeconds);

    if (!lockId) {
      throw new Error(`Failed to acquire lock for ${key}. Already locked.`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, lockId);
    }
  }

  async isLocked(key) {
    if (!this.initialized) {
      return false;
    }

    try {
      if (this.useMemoryFallback) {
        const lock = this.locks.get(key);
        if (lock && lock.expiresAt > Date.now()) {
          return true;
        }
        this.locks.delete(key);
        return false;
      }

      const isLocked = await this.client.exists(`lock:${key}`);
      return isLocked === 1;
    } catch (error) {
      console.error(`[DistributedLock] Error checking lock ${key}:`, error.message);
      return false;
    }
  }

  async close() {
    if (this.client) {
      await this.client.quit();
      this.initialized = false;
      console.log('[DistributedLock] Redis connection closed');
    }
  }
}

module.exports = new DistributedLockService();
