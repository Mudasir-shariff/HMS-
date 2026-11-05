'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { HMSStore } from '@/lib/store/hms-store';
import { syncFromSupabase } from '@/lib/supabase/sync';
import type { Visit, Patient, Drug, Dispensing } from '@/lib/types/database';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

interface RealtimeContextValue {
  status: ConnectionStatus;
  lastSyncedAt: Date | null;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'reconnecting',
  lastSyncedAt: null,
  reconnect: () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('reconnecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refetchAllActive = useCallback(() => {
    queryClient.refetchQueries({ type: 'active' });
    syncFromSupabase().catch(() => {});
    setLastSyncedAt(new Date());
  }, [queryClient]);

  // Window Focus & Online/Offline listeners (re-fetch when phone wakes or tab regains focus)
  useEffect(() => {
    function handleOnline() {
      setStatus('reconnecting');
      refetchAllActive();
    }

    function handleOffline() {
      setStatus('offline');
    }

    function handleFocus() {
      refetchAllActive();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refetchAllActive]);

  // Main Persistent Realtime Channel (One channel per session across all tables)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    const supabase = createClient();
    const channelId = `hospital-sync-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelId);

    // Debounced query invalidation helpers to prevent socket exhaustion and thundering herds
    let visitDebounceTimer: any = null;
    const triggerVisitInvalidation = () => {
      if (visitDebounceTimer) clearTimeout(visitDebounceTimer);
      visitDebounceTimer = setTimeout(() => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
      }, 300);
    };

    let patientDebounceTimer: any = null;
    const triggerPatientInvalidation = () => {
      if (patientDebounceTimer) clearTimeout(patientDebounceTimer);
      patientDebounceTimer = setTimeout(() => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      }, 300);
    };

    let drugDebounceTimer: any = null;
    const triggerDrugInvalidation = () => {
      if (drugDebounceTimer) clearTimeout(drugDebounceTimer);
      drugDebounceTimer = setTimeout(() => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
      }, 300);
    };

    let dispDebounceTimer: any = null;
    const triggerDispInvalidation = () => {
      if (dispDebounceTimer) clearTimeout(dispDebounceTimer);
      dispDebounceTimer = setTimeout(() => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.dispensings.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
      }, 300);
    };

    // ── 1. VISITS (Live OPD Queue & Status updates across all roles) ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visits' },
      (payload) => {
        setLastSyncedAt(new Date());

        queryClient.setQueriesData<Visit[]>(
          { queryKey: ['visits'] },
          (oldVisits) => {
            if (!oldVisits) return oldVisits;

            if (payload.eventType === 'INSERT') {
              const newVisit = payload.new as Visit;
              if (oldVisits.some((v) => v.id === newVisit.id)) return oldVisits;
              const next = [...oldVisits, newVisit];
              next.sort((a, b) => (Number(a.token_number) || 0) - (Number(b.token_number) || 0));
              return next;
            }

            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Visit;
              return oldVisits.map((v) => (v.id === updated.id ? { ...v, ...updated } : v));
            }

            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as any)?.id;
              if (!deletedId) return oldVisits;
              return oldVisits.filter((v) => v.id !== deletedId);
            }

            return oldVisits;
          }
        );

        // Mirror to HMSStore (skipRemoteSync=true prevents infinite loop back to Supabase)
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          HMSStore.saveVisit(payload.new as any, { skipRemoteSync: true });
        } else if (payload.eventType === 'DELETE' && (payload.old as any)?.id) {
          HMSStore.deleteVisit((payload.old as any).id, { skipRemoteSync: true });
        }

        triggerVisitInvalidation();
      }
    );

    // ── 2. PATIENTS (Live Patient Registration & Updates) ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'patients' },
      (payload) => {
        setLastSyncedAt(new Date());

        queryClient.setQueriesData<Patient[]>(
          { queryKey: ['patients'] },
          (oldPatients) => {
            if (!oldPatients) return oldPatients;

            if (payload.eventType === 'INSERT') {
              const newPat = payload.new as Patient;
              if (oldPatients.some((p) => p.id === newPat.id)) return oldPatients;
              return [newPat, ...oldPatients];
            }

            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Patient;
              return oldPatients.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
            }

            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as any)?.id;
              if (!deletedId) return oldPatients;
              return oldPatients.filter((p) => p.id !== deletedId);
            }

            return oldPatients;
          }
        );

        // Mirror to HMSStore (skipRemoteSync=true prevents infinite loop back to Supabase)
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          HMSStore.savePatient(payload.new as any, { skipRemoteSync: true });
        } else if (payload.eventType === 'DELETE' && (payload.old as any)?.id) {
          HMSStore.deletePatient((payload.old as any).id, { skipRemoteSync: true });
        }

        triggerPatientInvalidation();
      }
    );

    // ── 3. DRUGS (Live Pharmacy Inventory & Stock decrements) ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'drugs' },
      (payload) => {
        setLastSyncedAt(new Date());

        queryClient.setQueriesData<Drug[]>(
          { queryKey: ['drugs'] },
          (oldDrugs) => {
            if (!oldDrugs) return oldDrugs;

            if (payload.eventType === 'INSERT') {
              const newDrug = payload.new as Drug;
              if (oldDrugs.some((d) => d.id === newDrug.id)) return oldDrugs;
              return [newDrug, ...oldDrugs];
            }

            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Drug;
              return oldDrugs.map((d) => (d.id === updated.id ? { ...d, ...updated } : d));
            }

            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as any)?.id;
              if (!deletedId) return oldDrugs;
              return oldDrugs.filter((d) => d.id !== deletedId);
            }

            return oldDrugs;
          }
        );

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          HMSStore.saveDrug(payload.new as any, { skipRemoteSync: true });
        } else if (payload.eventType === 'DELETE' && (payload.old as any)?.id) {
          HMSStore.deleteDrug((payload.old as any).id, { skipRemoteSync: true });
        }

        triggerDrugInvalidation();
      }
    );

    // Debounce prescription invalidation by 150ms so multi-item batches settle before pharmacy refetches
    let rxDebounceTimer: any = null;
    const triggerRxInvalidation = () => {
      if (rxDebounceTimer) clearTimeout(rxDebounceTimer);
      rxDebounceTimer = setTimeout(() => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
        syncFromSupabase().catch(() => {});
      }, 150);
    };

    // ── 4. PRESCRIPTIONS (Doctor finalize -> Instant Pharmacy queue) ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescriptions' },
      () => {
        triggerRxInvalidation();
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescription_items' },
      () => {
        triggerRxInvalidation();
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lab_test_orders' },
      () => {
        triggerRxInvalidation();
      }
    );

    // ── 5. DISPENSINGS (Pharmacy dispense -> Complete visit & update stock) ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dispensings' },
      (payload) => {
        setLastSyncedAt(new Date());

        queryClient.setQueriesData<Dispensing[]>(
          { queryKey: ['dispensings'] },
          (oldDisp) => {
            if (!oldDisp) return oldDisp;

            if (payload.eventType === 'INSERT') {
              const newDisp = payload.new as Dispensing;
              if (oldDisp.some((d) => d.id === newDisp.id)) return oldDisp;
              return [newDisp, ...oldDisp];
            }

            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Dispensing;
              return oldDisp.map((d) => (d.id === updated.id ? { ...d, ...updated } : d));
            }

            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as any)?.id;
              if (!deletedId) return oldDisp;
              return oldDisp.filter((d) => d.id !== deletedId);
            }

            return oldDisp;
          }
        );

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          HMSStore.saveDispensing(payload.new as any);
        } else if (payload.eventType === 'DELETE' && (payload.old as any)?.id) {
          HMSStore.deleteDispensing((payload.old as any).id);
        }

        triggerDispInvalidation();
      }
    );

    // ── 6. STAFF PROFILES & DOCTORS ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_profiles' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });
        syncFromSupabase().catch(() => {});
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'doctors' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });
        syncFromSupabase().catch(() => {});
      }
    );

    // ── 7. WARDS, BEDS & ADMISSIONS ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wards' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.wards.all });
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'beds' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.wards.all });
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'admissions' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.admissions.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
      }
    );

    // ── 8. HOSPITAL SETTINGS ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hospital_settings' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
      }
    );

    // Channel subscription lifecycle
    channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected');
        setLastSyncedAt(new Date());
        refetchAllActive();
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
        setStatus('reconnecting');
      } else if (subStatus === 'CLOSED') {
        setStatus('reconnecting');
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient, refetchAllActive]);

  const reconnect = useCallback(() => {
    setStatus('reconnecting');
    refetchAllActive();
  }, [refetchAllActive]);

  const value = useMemo(
    () => ({
      status,
      lastSyncedAt,
      reconnect,
    }),
    [status, lastSyncedAt, reconnect]
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
