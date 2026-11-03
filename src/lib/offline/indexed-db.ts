/* ──────────────────────────────────────────────────────────────
   Native IndexedDB Wrapper for Offline Mutation Queue
   Zero external dependencies, cross-browser compatibility
   ────────────────────────────────────────────────────────────── */

const DB_NAME = 'hms_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'mutation_queue';

export interface QueuedMutation {
  id: string;
  idempotencyKey: string;
  type: 'register_patient' | 'dispense' | 'save_prescription' | 'update_visit' | 'custom';
  payload: any;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  status: 'pending' | 'processing' | 'failed';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueMutation(mutation: Omit<QueuedMutation, 'createdAt' | 'retryCount' | 'status'>): Promise<QueuedMutation> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: QueuedMutation = {
      ...mutation,
      createdAt: Date.now(),
      retryCount: 0,
      status: 'pending',
    };

    const request = store.add(record);
    request.onsuccess = () => {
      window.dispatchEvent(new CustomEvent('hms-offline-queue-changed'));
      resolve(record);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = (request.result as QueuedMutation[]) || [];
      // Sort oldest first (FIFO)
      items.sort((a, b) => a.createdAt - b.createdAt);
      resolve(items.filter((m) => m.status === 'pending' || m.status === 'failed'));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateMutationStatus(
  id: string,
  updates: Partial<Pick<QueuedMutation, 'status' | 'retryCount' | 'lastError'>>
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedMutation;
      if (!existing) return resolve();

      const updated = { ...existing, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('hms-offline-queue-changed'));
        resolve();
      };
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function removeMutation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      window.dispatchEvent(new CustomEvent('hms-offline-queue-changed'));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllMutations(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => {
      window.dispatchEvent(new CustomEvent('hms-offline-queue-changed'));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

