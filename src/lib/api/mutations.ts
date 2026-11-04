import { createClient } from '@/lib/supabase/client';
import { getQueryClient } from '@/lib/query/provider';
import { queryKeys } from '@/lib/query/keys';
import { HMSStore } from '@/lib/store/hms-store';
import type { QueryClient } from '@tanstack/react-query';
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
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.doctorId);
  const doctorId = isValidUUID ? params.doctorId : null;

  const { data, error } = await supabase.rpc('register_patient_and_visit_atomic', {
    p_name: params.name,
    p_age: params.age,
    p_phone: params.phone,
    p_doctor_id: doctorId,
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

  // Direct cache update for instant UI response (<1s)
  const client = getQueryClient();
  client.setQueriesData<Patient[]>({ queryKey: ['patients'] }, (old) => {
    if (!old) return [patient];
    if (old.some((p) => p.id === patient.id)) return old.map((p) => (p.id === patient.id ? patient : p));
    return [patient, ...old];
  });
  client.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) => {
    if (!old) return [visit];
    if (old.some((v) => v.id === visit.id)) return old.map((v) => (v.id === visit.id ? visit : v));
    const next = [...old, visit];
    next.sort((a, b) => (Number(a.token_number) || 0) - (Number(b.token_number) || 0));
    return next;
  });

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

/**
 * Save / Create / Update a Drug in Supabase with instant QueryClient cache invalidation.
 */
export async function saveDrugMutation(
  drug: Drug,
  client?: QueryClient
): Promise<{ success: boolean; data?: Drug; error?: string }> {
  const supabase = createClient();
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(drug.id);
  const drugId = isValidId ? drug.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : drug.id);

  const payload: any = {
    id: drugId,
    name: drug.name.trim(),
    drug_type: drug.drug_type || 'tablet',
    custom_type_name: drug.custom_type_name || null,
    unit_price: Number(drug.selling_price) || 0,
    selling_price: Number(drug.selling_price) || 0,
    purchase_price: Number(drug.purchase_price) || 0,
    stock_quantity: Math.max(0, Number(drug.stock_quantity) || 0),
    low_stock_limit: Math.max(0, Number(drug.low_stock_limit) || 10),
    reorder_level: Math.max(0, Number(drug.low_stock_limit) || 20),
    boxes: drug.boxes ? Number(drug.boxes) : null,
    tablets_per_sheet: drug.tablets_per_sheet ? Number(drug.tablets_per_sheet) : null,
    price_per_sheet: drug.selling_price_per_sheet ? Number(drug.selling_price_per_sheet) : (drug.price_per_sheet ? Number(drug.price_per_sheet) : null),
    supplier: drug.supplier || null,
    unit: drug.unit || 'unit',
    batch_number: drug.batch_number?.trim() || null,
    expiry_date: drug.expiry_date || null,
    schedule_h: Boolean(drug.schedule_h),
    schedule_h1: Boolean(drug.schedule_h1),
    is_active: drug.is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('drugs')
    .upsert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('Supabase saveDrug error:', error);
    return { success: false, error: error.message };
  }

  const savedDrug: Drug = {
    ...drug,
    id: data.id,
    selling_price: Number(data.selling_price) || Number(data.unit_price) || 0,
    purchase_price: Number(data.purchase_price) || 0,
    stock_quantity: Number(data.stock_quantity) || 0,
    low_stock_limit: Number(data.low_stock_limit) || 10,
    expiry_date: data.expiry_date,
    updated_at: data.updated_at,
  };

  // Update in-memory HMSStore
  HMSStore.saveDrug(savedDrug);

  // Invalidate TanStack Query cache so /pharmacy and /admin refresh immediately
  const qClient = client || getQueryClient();
  qClient.invalidateQueries({ queryKey: queryKeys.drugs.all });

  return { success: true, data: savedDrug };
}
