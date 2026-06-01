import { EEGData } from '../hooks/useBluetooth';
import { DetectionResult } from '../hooks/useWebSocket';

const DB_NAME = 'EEGCacheDB';
const DB_VERSION = 1;
const EEG_STORE = 'eeg_data';
const DETECTION_STORE = 'detection_results';
const SYNC_STATUS_STORE = 'sync_status';

export interface CachedEEGData extends EEGData {
  _id?: number;
  synced: number;
}

export interface CachedDetectionResult extends DetectionResult {
  _id?: number;
  synced: number;
}

export interface SyncStatus {
  id: string;
  lastSyncTime: number;
  pendingCount: number;
}

class EEGCacheDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(EEG_STORE)) {
          const eegStore = db.createObjectStore(EEG_STORE, { keyPath: '_id', autoIncrement: true });
          eegStore.createIndex('synced', 'synced', { unique: false });
          eegStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(DETECTION_STORE)) {
          const detStore = db.createObjectStore(DETECTION_STORE, { keyPath: '_id', autoIncrement: true });
          detStore.createIndex('synced', 'synced', { unique: false });
          detStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(SYNC_STATUS_STORE)) {
          db.createObjectStore(SYNC_STATUS_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  async addEEGData(data: EEGData): Promise<void> {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EEG_STORE], 'readwrite');
      const store = transaction.objectStore(EEG_STORE);
      const cachedData: CachedEEGData = { ...data, synced: 0 };
      const request = store.add(cachedData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async addDetectionResult(result: DetectionResult): Promise<void> {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DETECTION_STORE], 'readwrite');
      const store = transaction.objectStore(DETECTION_STORE);
      const cachedResult: CachedDetectionResult = { ...result, synced: 0 };
      const request = store.add(cachedResult);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedEEGData(): Promise<CachedEEGData[]> {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EEG_STORE], 'readonly');
      const store = transaction.objectStore(EEG_STORE);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(0));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedDetectionResults(): Promise<CachedDetectionResult[]> {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DETECTION_STORE], 'readonly');
      const store = transaction.objectStore(DETECTION_STORE);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(0));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markEEGDataSynced(ids: number[]): Promise<void> {
    await this.ensureDB();
    const transaction = this.db!.transaction([EEG_STORE], 'readwrite');
    const store = transaction.objectStore(EEG_STORE);
    
    for (const id of ids) {
      const request = store.get(id);
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          data.synced = 1;
          store.put(data);
        }
      };
    }
  }

  async markDetectionResultsSynced(ids: number[]): Promise<void> {
    await this.ensureDB();
    const transaction = this.db!.transaction([DETECTION_STORE], 'readwrite');
    const store = transaction.objectStore(DETECTION_STORE);
    
    for (const id of ids) {
      const request = store.get(id);
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          data.synced = 1;
          store.put(data);
        }
      };
    }
  }

  async clearSyncedData(): Promise<void> {
    await this.ensureDB();
    
    const clearStore = async (storeName: string) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('synced');
        const request = index.openCursor(IDBKeyRange.only(1));
        
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    };

    await clearStore(EEG_STORE);
    await clearStore(DETECTION_STORE);
  }

  async getPendingCount(): Promise<{ eegCount: number; detectionCount: number }> {
    await this.ensureDB();
    
    const countUnsynced = (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index('synced');
        const request = index.count(IDBKeyRange.only(0));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    return {
      eegCount: await countUnsynced(EEG_STORE),
      detectionCount: await countUnsynced(DETECTION_STORE)
    };
  }

  async getRecentEEGData(limit: number = 1000): Promise<CachedEEGData[]> {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EEG_STORE], 'readonly');
      const store = transaction.objectStore(EEG_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(all.slice(0, limit).reverse());
      };
      request.onerror = () => reject(request.error);
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const eegCacheDB = new EEGCacheDB();
