import { createClient } from '@/lib/supabase/client';
import { getQueryClient } from '@/lib/query/provider';
import { queryKeys } from '@/lib/query/keys';
import type { Patient, Visit, Dispensing, DispensingItem, Drug } from '@/lib/types/database';

export interface RegisterPatientParams {
  name: string;
  age: number;
  phone: string;
  doctorId: string;
  bloodGroup?: string;
  hasBP?: boolean;
  hasSugar?: boolean;
  otherConditions?: string;
  uhid?: string;
}

export interface RegisterResult {
  patient: Patient;
  visit: Visit;
}

/**
 * Register a patient and generate daily token + visit number atomically via Postgres RPC.
 * Guaranteed no duplicate tokens even with concurrent receptionists.
 */
export async function registerPatientAndVisitAtomic(
  params: RegisterPatientParams
): Promise<RegisterResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('register_patient_and_visit_atomic', {
    p_name: params.name,
    p_age: params.age,
    p_phone: params.phone,
    p_doctor_id: params.doctorId,
    p_blood_group: params.bloodGroup || null,
    p_has_bp: Boolean(params.hasBP),
    p_has_sugar: Boolean(params.hasSugar),
    p_other_conditions: params.otherConditions || null,
    p_uhid: params.uhid || null,
  });

  if (error) {
    console.warn('RPC register_patient_and_visit_atomic failed, using fallback:', error.message);
    throw new Error(error.message);
  }

  const patient = data.patient as Patient;
  const visit = data.visit as Visit;

  // Invalidate queries to update cache
  const client = getQueryClient();
  client.invalidateQueries({ queryKey: queryKeys.patients.all });
  client.invalidateQueries({ queryKey: queryKeys.visits.all });

  return { patient, visit };
}

export interface DispensePrescriptionParams {
  prescriptionId?: string;
  pharmacistId?: string;
  pharmacistName?: string;
  items: {
    drugId?: string;
    drugName: string;
    quantity: number;
    unitPrice: number;
    totalPrice?: number;
    isCustom?: boolean;
  }[];
  totalAmount: number;
  overrideReason?: string;
  isWalkIn?: boolean;
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  patientUhid?: string;
  uaid?: string;
  stayDayNumber?: number;
}

/**
 * Atomic dispensing RPC: locks visit, checks stock >= qty with FOR UPDATE,
 * decrements stock, writes dispensing record, and updates visit to 'dispensed'.
 */
export async function dispensePrescriptionAtomic(
  params: DispensePrescriptionParams
): Promise<{ success: boolean; dispensingId: string }> {
  const supabase = createClient();

  const formattedItems = params.items.map((i) => ({
    drug_id: i.drugId || null,
    drug_name: i.drugName,
    quantity: i.quantity,
    unit_price: i.unitPrice,
    total_price: i.totalPrice ?? i.quantity * i.unitPrice,
    is_custom: Boolean(i.isCustom),
  }));

  const { data, error } = await supabase.rpc('dispense_prescription_atomic', {
    p_prescription_id: params.prescriptionId || null,
    p_pharmacist_id: params.pharmacistId || null,
    p_pharmacist_name: params.pharmacistName || 'Pharmacist on Duty',
    p_items: formattedItems,
    p_override_reason: params.overrideReason || null,
    p_total_amount: params.totalAmount,
    p_is_walk_in: Boolean(params.isWalkIn),
    p_patient_id: params.patientId || null,
    p_patient_name: params.patientName || null,
    p_patient_phone: params.patientPhone || null,
    p_patient_uhid: params.patientUhid || null,
    p_uaid: params.uaid || null,
    p_stay_day_number: params.stayDayNumber || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Invalidate queries so that inventory and visit queues sync across devices
  const client = getQueryClient();
  client.invalidateQueries({ queryKey: queryKeys.visits.all });
  client.invalidateQueries({ queryKey: queryKeys.drugs.all });
  client.invalidateQueries({ queryKey: queryKeys.dispensings.all });
  client.invalidateQueries({ queryKey: queryKeys.prescriptions.all });

  return {
    success: true,
    dispensingId: data.dispensing_id,
  };
}

/**
 * Optimistic Concurrency Update helper.
 * If expectedVersion is supplied and the row in DB has a newer version,
 * throws an Error indicating record has changed.
 */
export async function updateWithVersionCheck<T extends { id: string }>(
  table: string,
  id: string,
  payload: Partial<T>,
  expectedVersion?: number
): Promise<T> {
  const supabase = createClient();

  let query = supabase.from(table).update({
    ...payload,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (expectedVersion !== undefined) {
    query = query.eq('version', expectedVersion);
  }

  const { data, error } = await query.select('*').single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('This record was modified by another user. Please reload the page to see the latest changes.');
    }
    throw new Error(error.message);
  }

  return data as T;
}

/**
 * Soft delete record by setting deleted_at timestamp.
 */
export async function softDeleteRecord(table: string, id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from(table).update({
    deleted_at: new Date().toISOString(),
  }).eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
