'use client';

import { useState, useEffect } from 'react';
import { getPendingMutations, QueuedMutation } from './indexed-db';
import { queueManager } from './queue-manager';

export interface OfflineQueueState {
  pendingCount: number;
  pendingItems: QueuedMutation[];
  isOnline: boolean;
  lastError: string | null;
  triggerSync: () => void;
}

export function useOfflineQueue(): OfflineQueueState {
  const [pendingItems, setPendingItems] = useState<QueuedMutation[]>([]);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [lastError, setLastError] = useState<string | null>(null);

  async function refreshQueue() {
    try {
      const items = await getPendingMutations();
      setPendingItems(items);
    } catch {
      // IndexedDB might not be available
    }
  }

  useEffect(() => {
    refreshQueue();

    function handleQueueChange() {
      refreshQueue();
    }

    function handleOnline() {
      setIsOnline(true);
      queueManager.processQueue();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    function handleFailure(e: any) {
      if (e?.detail?.error) {
        setLastError(e.detail.error);
        setTimeout(() => setLastError(null), 6000);
      }
    }

    window.addEventListener('hms-offline-queue-changed', handleQueueChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('hms-sync-failure', handleFailure);

    return () => {
      window.removeEventListener('hms-offline-queue-changed', handleQueueChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('hms-sync-failure', handleFailure);
    };
  }, []);

  return {
    pendingCount: pendingItems.length,
    pendingItems,
    isOnline,
    lastError,
    triggerSync: () => queueManager.processQueue(),
  };
}

