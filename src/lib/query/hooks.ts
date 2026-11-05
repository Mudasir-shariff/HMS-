import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
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
    staleTime: 5000,
    refetchInterval: 15000, // 15s fallback; Realtime handles instant <50ms updates
  });
}

export function usePatients(search?: string) {
  return useQuery({
    queryKey: queryKeys.patients.search(search),
    queryFn: () => fetchPatients(search),
    staleTime: 5000,
    refetchInterval: 30000,
  });
}

export function usePrescriptions(visitId?: string) {
  return useQuery({
    queryKey: visitId ? queryKeys.prescriptions.byVisit(visitId) : queryKeys.prescriptions.all,
    queryFn: () => fetchPrescriptions(visitId),
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

export function useDrugs() {
  return useQuery({
    queryKey: queryKeys.drugs.all,
    queryFn: fetchDrugs,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors.all,
    queryFn: fetchDoctors,
    staleTime: 10000,
    refetchInterval: false,
  });
}

export function useUserProfiles() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: fetchUserProfiles,
    staleTime: 10000,
    refetchInterval: false,
  });
}

export function useDispensings() {
  return useQuery({
    queryKey: queryKeys.dispensings.all,
    queryFn: fetchDispensings,
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

export function useWards() {
  return useQuery({
    queryKey: queryKeys.wards.all,
    queryFn: fetchWards,
    staleTime: 10000,
    refetchInterval: false,
  });
}

export function useBeds() {
  return useQuery({
    queryKey: queryKeys.beds.all,
    queryFn: fetchBeds,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useAdmissions() {
  return useQuery({
    queryKey: queryKeys.admissions.all,
    queryFn: fetchAdmissions,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useHospitalSettings() {
  return useQuery({
    queryKey: queryKeys.settings.current,
    queryFn: fetchSettings,
    staleTime: 30000,
    refetchInterval: false,
  });
}
