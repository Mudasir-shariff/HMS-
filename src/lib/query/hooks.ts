import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { HMSStore } from '@/lib/store/hms-store';
import {
  fetchVisits,
  fetchPatients,
  fetchPrescriptions,
  fetchDrugs,
  fetchDoctors,
  fetchUserProfiles,
  fetchWards,
  fetchBeds,
  fetchAdmissions,
  fetchSettings,
  fetchDispensings,
} from '@/lib/api';

export function useVisits(filters?: { doctorId?: string; status?: string; date?: string }) {
  return useQuery({
    queryKey: queryKeys.visits.list(filters),
    queryFn: () => fetchVisits(filters),
    initialData: () => {
      let v = HMSStore.getVisits();
      if (filters?.doctorId) v = v.filter((item) => item.doctor_id === filters.doctorId);
      if (filters?.status) v = v.filter((item) => item.status === filters.status);
      return v;
    },
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 30000, // 30s fallback safety net; Realtime handles instant <50ms updates
  });
}

export function usePatients(search?: string) {
  return useQuery({
    queryKey: queryKeys.patients.search(search),
    queryFn: () => fetchPatients(search),
    initialData: () => {
      const p = HMSStore.getPatients();
      if (search && search.trim()) {
        const s = search.trim().toLowerCase();
        return p.filter(
          (item) =>
            item.name.toLowerCase().includes(s) ||
            item.phone.includes(s) ||
            item.uhid.toLowerCase().includes(s)
        );
      }
      return p;
    },
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 60000, // 60s fallback; Realtime handles immediate registration
  });
}

export function usePrescriptions(visitId?: string) {
  return useQuery({
    queryKey: visitId ? queryKeys.prescriptions.byVisit(visitId) : queryKeys.prescriptions.all,
    queryFn: () => fetchPrescriptions(visitId),
    initialData: () => {
      const rx = HMSStore.getPrescriptions();
      return visitId ? rx.filter((p) => p.visit_id === visitId) : rx;
    },
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 30000, // 30s fallback safety net; Realtime handles instant arrival
  });
}

export function useDrugs() {
  return useQuery({
    queryKey: queryKeys.drugs.all,
    queryFn: fetchDrugs,
    initialData: () => HMSStore.getDrugs(),
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 60000, // 60s fallback; Realtime patches inventory stock changes
  });
}

export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors.all,
    queryFn: fetchDoctors,
    initialData: () => {
      const d = HMSStore.getDoctors();
      return d.map((doc) => ({
        id: doc.id,
        user_id: doc.id,
        full_name: doc.full_name,
        specialization: doc.specialization,
        consultation_room: doc.consultation_room,
        consultation_fee: doc.consultation_fee ?? 500,
        opd_timings: doc.opd_timings,
        is_available: (doc as any).is_available ?? doc.is_active ?? true,
        created_at: doc.created_at,
      }));
    },
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: false, // Event-driven via Realtime + window focus
  });
}

export function useUserProfiles() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: fetchUserProfiles,
    initialData: () => HMSStore.getUsers(),
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: false, // Event-driven via Realtime
  });
}

export function useDispensings() {
  return useQuery({
    queryKey: queryKeys.dispensings.all,
    queryFn: fetchDispensings,
    initialData: () => HMSStore.getDispensings(),
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 30000, // 30s fallback; Realtime patches dispensed records immediately
  });
}

export function useWards() {
  return useQuery({
    queryKey: queryKeys.wards.all,
    queryFn: fetchWards,
    initialData: () => HMSStore.getWards(),
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: false,
  });
}

export function useBeds() {
  return useQuery({
    queryKey: queryKeys.beds.all,
    queryFn: fetchBeds,
    initialData: () => HMSStore.getBeds(),
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 60000,
  });
}

export function useAdmissions() {
  return useQuery({
    queryKey: queryKeys.admissions.all,
    queryFn: fetchAdmissions,
    initialData: () => HMSStore.getAdmissions(),
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: 60000,
  });
}

export function useHospitalSettings() {
  return useQuery({
    queryKey: queryKeys.settings.current,
    queryFn: fetchSettings,
    initialData: () => {
      const s = HMSStore.getSettings();
      return {
        id: '00000000-0000-0000-0000-000000000001',
        hospital_name: s.hospital_name || 'RADHAKRISHNA HOSPITAL',
        address: s.address || '',
        phone: s.phone || '',
        token_reset_hour: s.token_reset_hour ?? 0,
        ip_hours_per_day: s.ip_hours_per_day ?? 18,
        prescription_paper_size: s.prescription_paper_size || 'A4',
        prescription_header: s.prescription_header || 'MULTISPECIALITY CARE',
        prescription_footer: s.prescription_footer || "Please follow the doctor's advice.",
        default_printer: s.default_printer || 'Pharmacy LaserJet Pro (Network)',
        schedule_h_action: s.schedule_h_action || 'warn',
        whatsapp_enabled: s.whatsapp_enabled ?? true,
        whatsapp_template: s.whatsapp_template || 'Namaste {patient_name}, your token at {hospital_name} is #{token}.',
        low_stock_days_warning: s.low_stock_days_warning ?? 7,
        expiry_days_warning: s.expiry_days_warning || [90, 60, 30],
        updated_at: new Date().toISOString(),
      };
    },
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 10000,
    refetchInterval: false,
  });
}
