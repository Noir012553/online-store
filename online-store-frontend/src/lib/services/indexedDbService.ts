/**
 * IndexedDB Service - Offline Translation Caching
 * Phase 3 Task #10: Offline support
 */

const DB_NAME = 'laptopstore_i18n';
const DB_VERSION = 1;
const STORE_NAME = 'translations';

interface StoredTranslation {
  key: string; // Format: "lang_namespace" e.g., "en_common"
  data: Record<string, string>;
  timestamp: number;
}

class IndexedDbService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[IndexedDB] Not available in this environment');
        resolve();
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDB] Failed to open database');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('[IndexedDB] Object store created');
        }
      };
    });

    return this.initPromise;
  }

  async save(lang: string, namespace: string, data: Record<string, string>): Promise<void> {
    await this.init();

    if (!this.db) {
      console.warn('[IndexedDB] Database not available, skipping save');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const key = `${lang}_${namespace}`;

        const item: StoredTranslation = {
          key,
          data,
          timestamp: Date.now(),
        };

        const request = store.put(item);

        request.onerror = () => {
          console.error('[IndexedDB] Save failed:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(`[IndexedDB] Saved: ${key}`);
          resolve();
        };
      } catch (error) {
        console.error('[IndexedDB] Save error:', error);
        reject(error);
      }
    });
  }

  async get(lang: string, namespace: string): Promise<Record<string, string> | null> {
    await this.init();

    if (!this.db) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const key = `${lang}_${namespace}`;

        const request = store.get(key);

        request.onerror = () => {
          console.error('[IndexedDB] Get failed:', request.error);
          resolve(null);
        };

        request.onsuccess = () => {
          const item = request.result as StoredTranslation | undefined;
          if (item) {
            console.log(`[IndexedDB] Retrieved: ${key}`);
            resolve(item.data);
          } else {
            resolve(null);
          }
        };
      } catch (error) {
        console.error('[IndexedDB] Get error:', error);
        resolve(null);
      }
    });
  }

  async remove(lang: string, namespace: string): Promise<void> {
    await this.init();

    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const key = `${lang}_${namespace}`;

        const request = store.delete(key);

        request.onerror = () => {
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(`[IndexedDB] Deleted: ${key}`);
          resolve();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async clear(): Promise<void> {
    await this.init();

    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => {
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log('[IndexedDB] All data cleared');
          resolve();
        };
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const indexedDbService = new IndexedDbService();
