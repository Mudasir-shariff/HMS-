'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import type { Visit, Patient, Drug, Dispensing, Prescription, PrescriptionItem } from '@/lib/types/database';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

let activeRealtimeChannel: any = null;

/**
 * Ultra-fast (<30ms) WebSocket peer broadcast across all hospital terminals.
 * Sends data payloads directly to doctors, pharmacists, and receptionists
 * without waiting for database polling or HTTP REST round-trips.
 */
export function broadcastChange(event: string, payload: any) {
  if (activeRealtimeChannel) {
    try {
      activeRealtimeChannel.send({
        type: 'broadcast',
        event,
        payload,
      });
    } catch (err) {
      console.warn('Realtime broadcast error:', err);
    }
  }
}

interface RealtimeContextValue {
  status: ConnectionStatus;
  lastSyncedAt: Date | null;
  reconnect: () => void;
  broadcast: (event: string, payload: any) => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'reconnecting',
  lastSyncedAt: null,
  reconnect: () => {},
  broadcast: () => {},
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
    const SHARED_HOSPITAL_CHANNEL = 'hospital-live-sync';
    const channel = supabase.channel(SHARED_HOSPITAL_CHANNEL, {
      config: {
        broadcast: { self: true },
      },
    });

    // ═════════════════════════════════════════════════════════════════════
    // A. ULTRA-FAST WEBSOCKET BROADCAST LISTENERS (<30ms peer-to-peer data)
    // ═════════════════════════════════════════════════════════════════════

    // 1. Visit Updated (Token state changes, cabin handoffs, completed visits)
    channel.on('broadcast', { event: 'visit_updated' }, ({ payload }) => {
      setLastSyncedAt(new Date());
      const updated = payload?.visit as Visit;
      if (!updated?.id) return;
      queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) => {
        if (!old) return [updated];
        const exists = old.some((v) => v.id === updated.id);
        if (exists) {
          return old.map((v) => (v.id === updated.id ? { ...v, ...updated } : v));
        }
        return [...old, updated];
      });
    });

    // 2. Patient Registered (Reception -> Instant Doctor Cabin Queue)
    channel.on('broadcast', { event: 'patient_registered' }, ({ payload }) => {
      setLastSyncedAt(new Date());
      const { patient, visit } = payload || {};
      if (patient?.id) {
        queryClient.setQueriesData<Patient[]>({ queryKey: ['patients'] }, (old) => {
          if (!old) return [patient];
          return old.some((p) => p.id === patient.id) ? old.map((p) => (p.id === patient.id ? patient : p)) : [patient, ...old];
        });
      }
      if (visit?.id) {
        queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) => {
          if (!old) return [visit];
          if (old.some((v) => v.id === visit.id)) return old.map((v) => (v.id === visit.id ? visit : v));
          const next = [...old, visit];
          next.sort((a, b) => (Number(a.token_number) || 0) - (Number(b.token_number) || 0));
          return next;
        });
      }
    });

    // 3. Prescription Created (Doctor Finalize -> Instant Pharmacy Dispensing Queue)
    channel.on('broadcast', { event: 'prescription_created' }, ({ payload }) => {
      setLastSyncedAt(new Date());
      const { prescription, visit } = payload || {};
      if (prescription?.id) {
        queryClient.setQueriesData<Prescription[]>({ queryKey: ['prescriptions'] }, (old) => {
          if (!old) return [prescription];
          const idx = old.findIndex((p) => p.id === prescription.id);
          if (idx >= 0) {
            const next = [...old];
            next[idx] = { ...prescription, items: prescription.items || next[idx].items || [] };
            return next;
          }
          return [prescription, ...old];
        });
      }
      if (visit?.id) {
        queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) => {
          if (!old) return [];
          return old.map((v) => (v.id === visit.id ? { ...v, ...visit, status: 'prescribed' } : v));
        });
      }
    });

    // 4. Prescription Dispensed (Pharmacy Delivered -> Completed Visit & Stock Deduction)
    channel.on('broadcast', { event: 'prescription_dispensed' }, ({ payload }) => {
      setLastSyncedAt(new Date());
      const { dispensing, visitId, drugUpdates } = payload || {};
      if (dispensing?.id) {
        queryClient.setQueriesData<Dispensing[]>({ queryKey: ['dispensings'] }, (old) => {
          if (!old) return [dispensing];
          if (old.some((d) => d.id === dispensing.id)) return old;
          return [dispensing, ...old];
        });
      }
      if (visitId) {
        queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) => {
          if (!old) return [];
          return old.map((v) => (v.id === visitId ? { ...v, status: 'dispensed' } : v));
        });
      }
      if (Array.isArray(drugUpdates) && drugUpdates.length > 0) {
        queryClient.setQueriesData<Drug[]>({ queryKey: ['drugs'] }, (old) => {
          if (!old) return old;
          return old.map((d) => {
            const up = drugUpdates.find((u) => u.drugId === d.id);
            if (up) {
              return { ...d, stock_quantity: Math.max(0, (d.stock_quantity || 0) - up.quantity) };
            }
            return d;
          });
        });
      }
    });

    // 5. Inventory Updated
    channel.on('broadcast', { event: 'inventory_updated' }, ({ payload }) => {
      setLastSyncedAt(new Date());
      const drug = payload?.drug as Drug;
      if (!drug?.id) return;
      queryClient.setQueriesData<Drug[]>({ queryKey: ['drugs'] }, (old) => {
        if (!old) return [drug];
        return old.some((d) => d.id === drug.id) ? old.map((d) => (d.id === drug.id ? { ...d, ...drug } : d)) : [drug, ...old];
      });
    });

    // Debounced query invalidation helpers
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
      }, 150);
    };

    // ── 4. PRESCRIPTIONS (Doctor finalize -> Instant Pharmacy queue) ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescriptions' },
      (payload) => {
        setLastSyncedAt(new Date());

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newRx = payload.new as Prescription;
          queryClient.setQueriesData<Prescription[]>(
            { queryKey: ['prescriptions'] },
            (oldRx) => {
              if (!oldRx) return [newRx];
              const idx = oldRx.findIndex((p) => p.id === newRx.id);
              if (idx >= 0) {
                const next = [...oldRx];
                next[idx] = { ...newRx, items: newRx.items || next[idx].items || [] };
                return next;
              }
              return [newRx, ...oldRx];
            }
          );
        } else if (payload.eventType === 'DELETE' && (payload.old as any)?.id) {
          const delId = (payload.old as any).id;
          queryClient.setQueriesData<Prescription[]>(
            { queryKey: ['prescriptions'] },
            (oldRx) => (oldRx ? oldRx.filter((p) => p.id !== delId) : [])
          );
        }

        triggerRxInvalidation();
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescription_items' },
      (payload) => {
        setLastSyncedAt(new Date());

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const item = payload.new as PrescriptionItem;
          if (item?.prescription_id) {
            queryClient.setQueriesData<Prescription[]>(
              { queryKey: ['prescriptions'] },
              (oldRx) => {
                if (!oldRx) return oldRx;
                return oldRx.map((p) => {
                  if (p.id !== item.prescription_id) return p;
                  const existingItems = p.items || [];
                  const idx = existingItems.findIndex((it) => it.id === item.id);
                  let updatedItems: PrescriptionItem[];
                  if (idx >= 0) {
                    updatedItems = [...existingItems];
                    updatedItems[idx] = { ...updatedItems[idx], ...item };
                  } else {
                    updatedItems = [...existingItems, item];
                  }
                  return { ...p, items: updatedItems };
                });
              }
            );
          }
        }

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
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.current });
      }
    );

    // Subscribe to channel and handle connection state
    channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        activeRealtimeChannel = channel;
        setStatus('connected');
        setLastSyncedAt(new Date());
      } else if (subStatus === 'CLOSED' || subStatus === 'CHANNEL_ERROR') {
        setStatus('offline');
      } else if (subStatus === 'TIMED_OUT') {
        setStatus('reconnecting');
      }
    });

    return () => {
      activeRealtimeChannel = null;
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const reconnect = useCallback(() => {
    setStatus('reconnecting');
    refetchAllActive();
  }, [refetchAllActive]);

  return (
    <RealtimeContext.Provider value={{ status, lastSyncedAt, reconnect, broadcast: broadcastChange }}>
      {children}
    </RealtimeContext.Provider>
  );
}
