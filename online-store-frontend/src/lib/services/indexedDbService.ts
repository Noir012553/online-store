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
        resolve();
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async save(lang: string, namespace: string, data: Record<string, string>): Promise<void> {
    await this.init();

    if (!this.db) {
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
          reject(request.error);
        };

        request.onsuccess = () => {
          resolve();
        };
      } catch (error) {
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
          resolve(null);
        };

        request.onsuccess = () => {
          const item = request.result as StoredTranslation | undefined;
          if (item) {
            resolve(item.data);
          } else {
            resolve(null);
          }
        };
      } catch (error) {
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
          resolve();
        };
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const indexedDbService = new IndexedDbService();
