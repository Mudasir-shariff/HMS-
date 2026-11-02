'use client';

import { useState, useEffect } from 'react';
import { HMSStore, UserAccount } from './hms-store';
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
    function handleChange() {
      setTick((t) => t + 1);
    }
    window.addEventListener('hms-store-change', handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
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

