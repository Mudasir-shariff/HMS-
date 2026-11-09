import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import {
  fetchVisits,
  fetchPatients,
  fetchPrescriptions,
  fetchDoctors,
  fetchUserProfiles,
  fetchWards,
  fetchBeds,
  fetchAdmissions,
  fetchSettings,
  fetchAuditLogs,
  fetchDeletedPatients,
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

export function useAuditLogs() {
  return useQuery({
    queryKey: queryKeys.auditLogs.all,
    queryFn: fetchAuditLogs,
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

export function useDeletedPatients() {
  return useQuery({
    queryKey: queryKeys.deletedPatients.all,
    queryFn: fetchDeletedPatients,
    staleTime: 5000,
    refetchInterval: 30000,
  });
}

