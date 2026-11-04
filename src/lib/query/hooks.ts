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
    refetchInterval: 4000,
  });
}

export function usePatients(search?: string) {
  return useQuery({
    queryKey: queryKeys.patients.search(search),
    queryFn: () => fetchPatients(search),
  });
}

export function usePrescriptions(visitId?: string) {
  return useQuery({
    queryKey: visitId ? queryKeys.prescriptions.byVisit(visitId) : queryKeys.prescriptions.all,
    queryFn: () => fetchPrescriptions(visitId),
    refetchInterval: 4000,
  });
}

export function useDrugs() {
  return useQuery({
    queryKey: queryKeys.drugs.all,
    queryFn: fetchDrugs,
  });
}

export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors.all,
    queryFn: fetchDoctors,
  });
}

export function useUserProfiles() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: fetchUserProfiles,
  });
}

export function useDispensings() {
  return useQuery({
    queryKey: queryKeys.dispensings.all,
    queryFn: fetchDispensings,
  });
}

export function useWards() {
  return useQuery({
    queryKey: queryKeys.wards.all,
    queryFn: fetchWards,
  });
}

export function useBeds() {
  return useQuery({
    queryKey: queryKeys.beds.all,
    queryFn: fetchBeds,
  });
}

export function useAdmissions() {
  return useQuery({
    queryKey: queryKeys.admissions.all,
    queryFn: fetchAdmissions,
  });
}

export function useHospitalSettings() {
  return useQuery({
    queryKey: queryKeys.settings.current,
    queryFn: fetchSettings,
  });
}

