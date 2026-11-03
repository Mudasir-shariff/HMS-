'use client';

import { useState, useEffect } from 'react';
import { HMSStore, UserAccount } from './hms-store';
import { syncFromSupabase, initSupabaseRealtime } from '@/lib/supabase/sync';
import type {
  Patient,
  Visit,
  Prescription,
  Drug,
  Dispensing,
  Ward,
  Bed,
  Admission,
  HospitalSettings,
} from '@/lib/types/database';

export function useHMSStore() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    syncFromSupabase();
    initSupabaseRealtime();

    function handleChange() {
      setTick((t) => t + 1);
    }
    window.addEventListener('hms-store-change', handleChange);
    window.addEventListener('storage', handleChange);

    // Active live polling interval (every 2.5s) to guarantee end-to-end dynamic synchronization
    const pollInterval = setInterval(() => {
      syncFromSupabase();
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('hms-store-change', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return {
    currentUser: HMSStore.getCurrentUser(),
    users: HMSStore.getUsers(),
    doctors: HMSStore.getDoctors(),
    patients: HMSStore.getPatients(),
    visits: HMSStore.getVisits(),
    prescriptions: HMSStore.getPrescriptions(),
    drugs: HMSStore.getDrugs(),
    dispensings: HMSStore.getDispensings(),
    wards: HMSStore.getWards(),
    beds: HMSStore.getBeds(),
    admissions: HMSStore.getAdmissions(),
    settings: HMSStore.getSettings(),
    refresh: () => setTick((t) => t + 1),
  };
}

