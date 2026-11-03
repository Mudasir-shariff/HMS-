'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';
import { queryKeys } from '@/lib/query/keys';
import type { Visit, Patient, Drug } from '@/lib/types/database';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

interface RealtimeContextValue {
  status: ConnectionStatus;
  lastSyncedAt: Date | null;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'connecting' as ConnectionStatus,
  lastSyncedAt: null,
  reconnect: () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('reconnecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refetchAllActive = useCallback(() => {
    queryClient.refetchQueries({ type: 'active' });
    setLastSyncedAt(new Date());
  }, [queryClient]);

  // Window Focus & Online/Offline listeners
  useEffect(() => {
    function handleOnline() {
      setStatus('reconnecting');
      refetchAllActive();
    }

    function handleOffline() {
      setStatus('offline');
    }

    function handleFocus() {
      // Re-synchronize when user returns to tab or phone wakes from sleep
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

  // Main Realtime Channel Subscription
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    const supabase = createClient();
    const channelId = `hms-rt-${user?.id || 'anon'}-${Date.now().toString().slice(-4)}`;

    const channel = supabase.channel(channelId);

    // ── 1. VISITS (Scoped by doctor for doctors, global for others) ──
    const visitFilter =
      user?.role === 'doctor' && user?.id
        ? `doctor_id=eq.${user.id}`
        : undefined;

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'visits',
        ...(visitFilter ? { filter: visitFilter } : {}),
      },
      (payload) => {
        setLastSyncedAt(new Date());

        // Direct Cache Mutation for < 1s responsiveness
        queryClient.setQueriesData<Visit[]>(
          { queryKey: ['visits'] },
          (oldVisits) => {
            if (!oldVisits) return oldVisits;

            if (payload.eventType === 'INSERT') {
              const newVisit = payload.new as Visit;
              // Avoid duplicates
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

        // Fallback invalidate to guarantee data relationship integrity
        queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
      }
    );

    // ── 2. PATIENTS ──
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

        queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      }
    );

    // ── 3. DRUGS (Live Pharmacy Inventory & Stock updates) ──
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

        queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
      }
    );

    // ── 4. PRESCRIPTIONS & PRESCRIPTION ITEMS ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescriptions' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescription_items' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });
      }
    );

    // ── 5. DISPENSINGS & DISPENSING ITEMS ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dispensings' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.dispensings.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
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
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'doctors' },
      () => {
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });
      }
    );

    // ── 7. WARDS, BEDS & ADMISSIONS ──
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

    // Channel connection status callback
    channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected');
        setLastSyncedAt(new Date());
        // Immediate sync on connect to ensure no missed events during handshake
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
  }, [user?.id, user?.role, queryClient, refetchAllActive]);

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

