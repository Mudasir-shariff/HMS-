'use client';

import {
  QueuedMutation,
  getPendingMutations,
  updateMutationStatus,
  removeMutation,
} from './indexed-db';
import { registerPatientAndVisitAtomic, dispensePrescriptionAtomic } from '@/lib/api/mutations';
import { pushPrescriptionToSupabase, pushVisitToSupabase } from '@/lib/supabase/sync';
import { getQueryClient } from '@/lib/query/provider';
import { queryKeys } from '@/lib/query/keys';

class OfflineQueueManager {
  private isProcessing = false;
  private backoffDelays = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.processQueue();
      });

      // Periodic check every 15s when online
      setInterval(() => {
        if (navigator.onLine && !this.isProcessing) {
          this.processQueue();
        }
      }, 15000);
    }
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing || typeof window === 'undefined' || !navigator.onLine) {
      return;
    }

    this.isProcessing = true;

    try {
      const items = await getPendingMutations();
      for (const item of items) {
        if (!navigator.onLine) break;

        await this.processItem(item);
      }
    } catch (err) {
      console.warn('Error processing offline queue:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processItem(item: QueuedMutation): Promise<void> {
    try {
      await updateMutationStatus(item.id, { status: 'processing' });

      switch (item.type) {
        case 'register_patient':
          await registerPatientAndVisitAtomic(item.payload);
          break;

        case 'dispense':
          await dispensePrescriptionAtomic(item.payload);
          break;

        case 'save_prescription':
          await pushPrescriptionToSupabase(item.payload.rx);
          if (item.payload.visit) {
            await pushVisitToSupabase(item.payload.visit);
          }
          break;

        default:
          console.warn('Unknown mutation type:', item.type);
      }

      // Success: Remove from queue and invalidate cache
      await removeMutation(item.id);

      const client = getQueryClient();
      client.invalidateQueries({ queryKey: queryKeys.visits.all });
      client.invalidateQueries({ queryKey: queryKeys.patients.all });
      client.invalidateQueries({ queryKey: queryKeys.drugs.all });
      client.invalidateQueries({ queryKey: queryKeys.dispensings.all });
    } catch (err: any) {
      console.warn(`Failed to sync queued item ${item.id}:`, err);
      const nextRetry = item.retryCount + 1;
      const delay = this.backoffDelays[Math.min(nextRetry - 1, this.backoffDelays.length - 1)];

      await updateMutationStatus(item.id, {
        status: 'failed',
        retryCount: nextRetry,
        lastError: err?.message || 'Network sync error',
      });

      // Dispatch failure event for UI toast
      window.dispatchEvent(
        new CustomEvent('hms-sync-failure', {
          detail: {
            mutationId: item.id,
            error: err?.message || 'Sync failed. Will retry automatically.',
          },
        })
      );

      // Wait before next attempt
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

export const queueManager = new OfflineQueueManager();

