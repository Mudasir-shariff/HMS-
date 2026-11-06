import { createClient } from './client';
import { generateUUID } from '../utils/quantity';
import type {
  Patient,
  Visit,
  Prescription,
  PrescriptionItem,
  Drug,
  Dispensing,
  DispensingItem,
  Admission,
  HospitalSettings,
  UserRole,
  UserAccount,
  Ward,
  Bed,
} from '../types/database';

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your-supabase-url' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
  );
}

let isSyncing = false;
let isRealtimeSubscribed = false;

/**
 * Direct Supabase sync & push operations
 */
export async function syncFromSupabase(): Promise<boolean> {
  return true;
}

export function initSupabaseRealtime() {
  // No-op: The single unified persistent WebSocket channel is managed by RealtimeProvider (src/lib/realtime/realtime-provider.tsx)
  return;
}

// ── Direct Push Helpers (Atomic & Resilient) ──

function isValidUUID(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function withTimeout<T>(
  queryOrFn: PromiseLike<T> | ((signal: AbortSignal) => PromiseLike<T>),
  ms = 4000
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch {}
      resolve(null);
    }, ms);
  });

  try {
    let promise: PromiseLike<T>;
    if (typeof queryOrFn === 'function') {
      promise = queryOrFn(controller.signal);
    } else {
      if (typeof (queryOrFn as any)?.abortSignal === 'function') {
        try {
          (queryOrFn as any).abortSignal(controller.signal);
        } catch {}
      }
      promise = queryOrFn;
    }

    const res = await Promise.race([promise, timeoutPromise]);
    if (res === null || timedOut || (res as any)?.error?.message?.includes('AbortError')) {
      return null;
    }
    return res as T;
  } catch (err: any) {
    if (timedOut || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      return null;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function pushUserToSupabase(user: UserAccount) {
  if (!isSupabaseConfigured() || !isValidUUID(user.id)) return;
  try {
    const supabase = createClient();
    const userPayload: any = {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone || null,
      is_active: user.is_active,
      updated_at: new Date().toISOString(),
    };
    if (user.email) userPayload.email = user.email.toLowerCase().trim();
    if (user.password) userPayload.password = user.password;
    if (user.specialization) userPayload.specialization = user.specialization;
    if (user.consultation_room) userPayload.consultation_room = user.consultation_room;
    if (user.consultation_fee) userPayload.consultation_fee = user.consultation_fee;
    if (user.opd_timings) userPayload.opd_timings = user.opd_timings;

    const { error: pErr } = await supabase.from('user_profiles').upsert(userPayload);
    if (pErr) console.error('Error pushing user_profile to Supabase:', pErr);

    if (user.role === 'doctor') {
      const { error: dErr } = await supabase.from('doctors').upsert({
        id: user.id,
        user_id: user.id,
        specialization: user.specialization || 'General Medicine',
        consultation_room: user.consultation_room || 'Room 1',
        is_available: user.is_active,
      });
      if (dErr) console.error('Error pushing doctor to Supabase:', dErr);
    }
  } catch (e) {
    console.warn('Failed to push user to Supabase:', e);
  }
}

export async function deleteUserFromSupabase(userId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(userId)) return;
  try {
    const supabase = createClient();
    await supabase.from('doctors').delete().eq('user_id', userId);
    await supabase.from('doctors').delete().eq('id', userId);
    await supabase.from('user_profiles').delete().eq('id', userId);
  } catch (err) {
    console.warn('Failed to delete user from Supabase:', err);
  }
}

export async function deletePatientFromSupabase(patientId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(patientId)) return;
  try {
    const supabase = createClient();
    await supabase.from('dispensings').delete().eq('patient_id', patientId);
    await supabase.from('prescriptions').delete().eq('patient_id', patientId);
    await supabase.from('visits').delete().eq('patient_id', patientId);
    await supabase.from('patients').delete().eq('id', patientId);
  } catch (err) {
    console.warn('Failed to delete patient from Supabase:', err);
  }
}

export async function deleteVisitFromSupabase(visitId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(visitId)) return;
  try {
    const supabase = createClient();
    await supabase.from('dispensings').delete().eq('prescription_id', visitId);
    await supabase.from('prescription_items').delete().eq('prescription_id', visitId);
    await supabase.from('prescriptions').delete().eq('visit_id', visitId);
    await supabase.from('visits').delete().eq('id', visitId);
  } catch (err) {
    console.warn('Failed to delete visit from Supabase:', err);
  }
}

export async function deleteVisitsFromSupabase(visitIds: string[]) {
  if (!isSupabaseConfigured() || !Array.isArray(visitIds) || visitIds.length === 0) return;
  try {
    const supabase = createClient();
    const validIds = visitIds.filter(isValidUUID);
    if (!validIds.length) return;
    await supabase.from('dispensings').delete().in('prescription_id', validIds);
    await supabase.from('prescription_items').delete().in('prescription_id', validIds);
    await supabase.from('prescriptions').delete().in('visit_id', validIds);
    await supabase.from('visits').delete().in('id', validIds);
  } catch (err) {
    console.warn('Failed to delete visits from Supabase:', err);
  }
}

export async function deletePrescriptionFromSupabase(rxId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(rxId)) return;
  try {
    const supabase = createClient();
    await supabase.from('prescription_items').delete().eq('prescription_id', rxId);
    await supabase.from('prescriptions').delete().eq('id', rxId);
  } catch (err) {
    console.warn('Failed to delete prescription from Supabase:', err);
  }
}

export async function deleteDrugFromSupabase(drugId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(drugId)) return;
  try {
    const supabase = createClient();
    await supabase.from('drugs').delete().eq('id', drugId);
  } catch (err) {
    console.warn('Failed to delete drug from Supabase:', err);
  }
}

export async function purgeAllRecordsFromSupabase() {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    await supabase.from('dispensing_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('dispensings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('prescription_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('prescriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('visits').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('patients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (err) {
    console.warn('Failed to purge records from Supabase:', err);
  }
}

const inFlightPatients = new Set<string>();
const inFlightVisits = new Set<string>();
const lastVisitPushTime = new Map<string, number>();

export async function pushPatientToSupabase(patient: Patient) {
  if (!isSupabaseConfigured() || !patient?.id) return;
  const patientId = isValidUUID(patient.id) ? patient.id : null;
  if (!patientId || inFlightPatients.has(patientId)) return;

  inFlightPatients.add(patientId);
  try {
    const supabase = createClient();
    const res = await withTimeout(
      supabase.from('patients').upsert({
        id: patientId,
        uhid: patient.uhid,
        name: patient.name,
        age: patient.age,
        phone: patient.phone,
        blood_group: patient.blood_group || null,
        has_bp: patient.has_bp,
        has_sugar: patient.has_sugar,
        other_conditions: patient.other_conditions || null,
        updated_at: new Date().toISOString(),
      }),
      4000
    );
    if (res?.error) console.warn('Supabase patient push warning:', res.error.message);
  } catch (e: any) {
    console.warn('Failed to push patient to Supabase:', e?.message || e);
  } finally {
    inFlightPatients.delete(patientId);
  }
}

export async function pushVisitToSupabase(visit: Visit) {
  if (!isSupabaseConfigured() || !visit?.id) return;
  const visitKey = `${visit.id}-${visit.status}`;

  // In-flight guard: prevent concurrent requests for same visit
  if (inFlightVisits.has(visitKey)) {
    return;
  }

  // Rate-limiting: do not push same visit state multiple times in 1.5s
  const now = Date.now();
  const lastTime = lastVisitPushTime.get(visitKey) || 0;
  if (now - lastTime < 1500) {
    return;
  }

  inFlightVisits.add(visitKey);
  lastVisitPushTime.set(visitKey, now);

  try {
    const supabase = createClient();
    const visitId = isValidUUID(visit.id) ? visit.id : null;
    if (!visitId) return;

    // Quick direct status update if record already exists
    const updateRes = await withTimeout(
      supabase
        .from('visits')
        .update({
          status: visit.status,
          follow_up_date: visit.follow_up_date || null,
          instructions: visit.instructions || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', visitId)
        .select('id'),
      4000
    );

    if (updateRes && !updateRes.error && updateRes.data && updateRes.data.length > 0) {
      return;
    }

    // Resolve doctor: Ensure the doctor exists in public.doctors so foreign key never fails (cached to prevent repeated network queries)
    let doctorIdToUse: string | null = null;
    if (isValidUUID(visit.doctor_id)) {
      if (doctorResolutionCache.has(visit.doctor_id)) {
        doctorIdToUse = doctorResolutionCache.get(visit.doctor_id)!;
      } else {
        const docRes = await withTimeout(
          supabase
            .from('doctors')
            .select('id, user_id')
            .or(`id.eq.${visit.doctor_id},user_id.eq.${visit.doctor_id}`)
            .limit(1)
            .maybeSingle(),
          3000
        );

        if (docRes?.data) {
          doctorIdToUse = docRes.data.id;
          doctorResolutionCache.set(visit.doctor_id, docRes.data.id);
        } else {
          doctorIdToUse = visit.doctor_id;
          doctorResolutionCache.set(visit.doctor_id, visit.doctor_id);
        }
      }
    }

    const patientIdToUse = isValidUUID(visit.patient_id) ? visit.patient_id : null;
    if (!patientIdToUse) return;

    const upsertRes = await withTimeout(
      supabase.from('visits').upsert({
        id: visitId,
        visit_number: visit.visit_number || `V-${Date.now().toString().slice(-4)}`,
        patient_id: patientIdToUse,
        doctor_id: doctorIdToUse,
        token_number: Number(visit.token_number) || 1,
        status: visit.status,
        follow_up_date: visit.follow_up_date || null,
        instructions: visit.instructions || null,
        updated_at: new Date().toISOString(),
      }),
      4000
    );

    if (upsertRes?.error) {
      console.warn('Supabase visit push warning:', upsertRes.error.message);
    }
  } catch (e: any) {
    console.warn('Failed to push visit to Supabase:', e?.message || e);
  } finally {
    inFlightVisits.delete(visitKey);
  }
}

export async function pushDrugToSupabase(drug: Drug) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const drugId = isValidUUID(drug.id) ? drug.id : generateUUID();
    const normalizedType = ['tablet', 'capsule', 'syrup', 'injection'].includes(drug.drug_type)
      ? drug.drug_type
      : 'other';

    const { error } = await supabase.from('drugs').upsert({
      id: drugId,
      name: drug.name.trim(),
      drug_type: normalizedType,
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
    });
    if (error) console.error('Error pushing drug to Supabase:', error);
  } catch (e) {
    console.warn('Failed to push drug to Supabase:', e);
  }
}

const doctorResolutionCache = new Map<string, string>();

const inFlightPrescriptions = new Set<string>();

export async function pushPrescriptionToSupabase(rx: Prescription) {
  if (!isSupabaseConfigured() || !rx?.id) return;
  const rxId = isValidUUID(rx.id) ? rx.id : generateUUID();
  if (inFlightPrescriptions.has(rxId)) return;
  inFlightPrescriptions.add(rxId);

  try {
    const supabase = createClient();

    // Resolve doctor_id to ensure foreign key passes (cached in-memory for instant lookups)
    let doctorIdToUse = rx.doctor_id;
    if (isValidUUID(rx.doctor_id)) {
      if (doctorResolutionCache.has(rx.doctor_id)) {
        doctorIdToUse = doctorResolutionCache.get(rx.doctor_id)!;
      } else {
        const docRes = await withTimeout(
          supabase
            .from('doctors')
            .select('id, user_id')
            .or(`id.eq.${rx.doctor_id},user_id.eq.${rx.doctor_id}`)
            .limit(1)
            .maybeSingle(),
          3000
        );
        if (docRes?.data) {
          doctorIdToUse = docRes.data.id;
          doctorResolutionCache.set(rx.doctor_id, docRes.data.id);
        }
      }
    }

    const rxUpsertRes = await withTimeout(
      supabase.from('prescriptions').upsert({
        id: rxId,
        visit_id: isValidUUID(rx.visit_id) ? rx.visit_id : null,
        doctor_id: isValidUUID(doctorIdToUse) ? doctorIdToUse : null,
        patient_id: isValidUUID(rx.patient_id) ? rx.patient_id : null,
        notes: rx.notes || null,
        uaid: rx.uaid || null,
        stay_day_number: rx.stay_day_number || null,
        updated_at: new Date().toISOString(),
      }),
      4000
    );

    if (rxUpsertRes === null) {
      console.warn('Prescription upsert timed out; halting dependent writes for', rxId);
      return;
    }

    if (rxUpsertRes.error) {
      console.warn('Prescription full upsert warning, retrying core schema:', rxUpsertRes.error.message);
      const coreRxRes = await withTimeout(
        supabase.from('prescriptions').upsert({
          id: rxId,
          visit_id: isValidUUID(rx.visit_id) ? rx.visit_id : null,
          doctor_id: isValidUUID(doctorIdToUse) ? doctorIdToUse : null,
          patient_id: isValidUUID(rx.patient_id) ? rx.patient_id : null,
          notes: rx.notes || null,
        }),
        3000
      );
      if (coreRxRes === null) {
        console.warn('Prescription core schema retry timed out; halting dependent writes for', rxId);
        return;
      }
      if (coreRxRes.error) {
        console.warn('Prescription core schema retry failed, halting dependent writes:', coreRxRes.error.message);
        return;
      }
    }

    if (rx.items && rx.items.length > 0) {
      const itemsPayload = rx.items.map((it) => ({
        id: isValidUUID(it.id) ? it.id : generateUUID(),
        prescription_id: rxId,
        drug_id: isValidUUID(it.drug_id) ? it.drug_id : null,
        drug_name: it.drug_name,
        dose_morning: Boolean(it.dose_morning),
        dose_afternoon: Boolean(it.dose_afternoon),
        dose_night: Boolean(it.dose_night),
        dose_relation: it.dose_relation || 'after_food',
        num_days: Number(it.num_days) || 1,
        quantity: Number(it.quantity) || 1,
        is_custom: Boolean(it.is_custom),
        item_type: it.item_type || null,
        custom_unit: it.custom_unit || null,
        added_by_pharmacist: Boolean(it.added_by_pharmacist),
        pharmacist_notes: it.pharmacist_notes || null,
      }));
      const itemsRes = await withTimeout(
        supabase.from('prescription_items').upsert(itemsPayload),
        4000
      );
      if (itemsRes === null) {
        console.warn('Prescription items upsert timed out; halting items retry for', rxId);
      } else if (itemsRes.error) {
        console.warn('Items full upsert warning, retrying core schema:', itemsRes.error.message);
        const coreItems = rx.items.map((it) => ({
          id: isValidUUID(it.id) ? it.id : generateUUID(),
          prescription_id: rxId,
          drug_id: isValidUUID(it.drug_id) ? it.drug_id : null,
          drug_name: it.drug_name,
          dose_morning: Boolean(it.dose_morning),
          dose_afternoon: Boolean(it.dose_afternoon),
          dose_night: Boolean(it.dose_night),
          dose_relation: it.dose_relation || 'after_food',
          num_days: Number(it.num_days) || 1,
          quantity: Number(it.quantity) || 1,
        }));
        const coreItemsRes = await withTimeout(
          supabase.from('prescription_items').upsert(coreItems),
          3000
        );
        if (coreItemsRes === null) {
          console.warn('Core items retry timed out; halting items retry for', rxId);
        } else if (coreItemsRes.error) {
          console.warn('Core items retry failed, attempting without drug_id:', coreItemsRes.error.message);
          const safeItems = rx.items.map((it) => ({
            id: isValidUUID(it.id) ? it.id : generateUUID(),
            prescription_id: rxId,
            drug_id: null,
            drug_name: it.drug_name,
            dose_morning: Boolean(it.dose_morning),
            dose_afternoon: Boolean(it.dose_afternoon),
            dose_night: Boolean(it.dose_night),
            dose_relation: it.dose_relation || 'after_food',
            num_days: Number(it.num_days) || 1,
            quantity: Number(it.quantity) || 1,
          }));
          const safeItemsRes = await withTimeout(
            supabase.from('prescription_items').upsert(safeItems),
            3000
          );
          if (safeItemsRes === null) {
            console.warn('Safe items retry timed out for', rxId);
          } else if (safeItemsRes.error) {
            console.warn('Safe items retry failed:', safeItemsRes.error.message);
          }
        }
      }
    }

    // Keep visit in Supabase strictly in lockstep with status = 'prescribed'
    if (isValidUUID(rx.visit_id)) {
      await withTimeout(
        supabase
          .from('visits')
          .update({ status: 'prescribed', updated_at: new Date().toISOString() })
          .eq('id', rx.visit_id),
        3000
      );
    } else if (isValidUUID(rx.patient_id)) {
      await withTimeout(
        supabase
          .from('visits')
          .update({ status: 'prescribed', updated_at: new Date().toISOString() })
          .eq('patient_id', rx.patient_id)
          .neq('status', 'dispensed')
          .neq('status', 'completed'),
        3000
      );
    }

    if (rx.lab_tests && rx.lab_tests.length > 0) {
      try {
        const labPayload = rx.lab_tests.map((lt) => ({
          id: isValidUUID(lt.id) ? lt.id : generateUUID(),
          prescription_id: rxId,
          test_name: lt.test_name,
          notes: lt.notes || null,
          created_at: lt.created_at || new Date().toISOString(),
        }));
        const { error: labErr } = await supabase.from('lab_test_orders').upsert(labPayload);
        if (labErr) console.warn('lab_test_orders upsert:', labErr.message);
      } catch (lErr) {
        console.warn('lab_test_orders table skipped:', lErr);
      }
    }
  } catch (e) {
    console.warn('Failed to push prescription to Supabase:', e);
  } finally {
    inFlightPrescriptions.delete(rxId);
  }
}

export async function pushDispensingToSupabase(disp: Dispensing) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const dispId = isValidUUID(disp.id) ? disp.id : generateUUID();

    // Resolve pharmacist_id
    let pharmacistIdToUse = disp.pharmacist_id;
    if (!isValidUUID(disp.pharmacist_id)) {
      const { data: activeUser } = await supabase
        .from('user_profiles')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (activeUser) pharmacistIdToUse = activeUser.id;
    }

    const { error: dErr } = await supabase.from('dispensings').upsert({
      id: dispId,
      prescription_id: isValidUUID(disp.prescription_id) ? disp.prescription_id : null,
      patient_id: isValidUUID(disp.patient_id) ? disp.patient_id : null,
      pharmacist_id: pharmacistIdToUse,
      is_walk_in: Boolean(disp.is_walk_in),
      total_amount: disp.total_amount,
      updated_at: new Date().toISOString(),
    });
    if (dErr) console.error('Error pushing dispensing to Supabase:', dErr);

    if (disp.items && disp.items.length > 0) {
      const itemsPayload = disp.items.map((it) => ({
        id: isValidUUID(it.id) ? it.id : generateUUID(),
        dispensing_id: dispId,
        drug_id: isValidUUID(it.drug_id) ? it.drug_id : null,
        drug_name: it.drug_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
      }));
      const { error: itemsErr } = await supabase.from('dispensing_items').upsert(itemsPayload);
      if (itemsErr) console.error('Error pushing dispensing_items to Supabase:', itemsErr);
    }
  } catch (e) {
    console.warn('Failed to push dispensing to Supabase:', e);
  }
}

export async function pushAdmissionToSupabase(adm: Admission) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    await supabase.from('admissions').upsert({
      id: adm.id,
      uaid: adm.uaid,
      patient_id: adm.patient_id,
      bed_id: adm.bed_id,
      doctor_id: adm.doctor_id,
      diagnosis: adm.diagnosis || null,
      has_bp: adm.has_bp,
      has_sugar: adm.has_sugar,
      other_conditions: adm.other_conditions || null,
      status: adm.status,
      admitted_at: adm.admitted_at,
      discharged_at: adm.discharged_at || null,
      hours_per_day: adm.hours_per_day || 18,
      total_bed_charges: adm.total_bed_charges || 0,
      total_pharmacy_charges: adm.total_pharmacy_charges || 0,
      total_lab_charges: adm.total_lab_charges || 0,
    });

    // Keep bed occupancy state synchronized in Supabase
    if (adm.bed_id && isValidUUID(adm.bed_id)) {
      const isOccupied = adm.status === 'admitted';
      await supabase.from('beds').update({ is_occupied: isOccupied }).eq('id', adm.bed_id);
    }
  } catch (e) {
    console.warn('Failed to push admission to Supabase:', e);
  }
}

export async function pushWardToSupabase(ward: Ward) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const wardId = isValidUUID(ward.id) ? ward.id : generateUUID();
    const { error } = await supabase.from('wards').upsert({
      id: wardId,
      name: ward.name.trim(),
      is_active: ward.is_active ?? true,
      created_at: ward.created_at || new Date().toISOString(),
    });
    if (error) console.error('Error pushing ward to Supabase:', error);
  } catch (e) {
    console.warn('Failed to push ward to Supabase:', e);
  }
}

export async function deleteWardFromSupabase(wardId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(wardId)) return;
  try {
    const supabase = createClient();
    await supabase.from('wards').delete().eq('id', wardId);
  } catch (err) {
    console.warn('Failed to delete ward from Supabase:', err);
  }
}

export async function pushBedToSupabase(bed: Bed) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const bedId = isValidUUID(bed.id) ? bed.id : generateUUID();
    const { error } = await supabase.from('beds').upsert({
      id: bedId,
      ward_id: bed.ward_id,
      bed_number: bed.bed_number.trim(),
      price_per_day: Number(bed.price_per_day) || 500,
      is_occupied: Boolean(bed.is_occupied),
      created_at: bed.created_at || new Date().toISOString(),
    });
    if (error) console.error('Error pushing bed to Supabase:', error);
  } catch (e) {
    console.warn('Failed to push bed to Supabase:', e);
  }
}

export async function deleteBedFromSupabase(bedId: string) {
  if (!isSupabaseConfigured() || !isValidUUID(bedId)) return;
  try {
    const supabase = createClient();
    await supabase.from('beds').delete().eq('id', bedId);
  } catch (err) {
    console.warn('Failed to delete bed from Supabase:', err);
  }
}

export async function pushSettingsToSupabase(settings: HospitalSettings) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const existing = await supabase.from('hospital_settings').select('id').limit(1).maybeSingle();
    let idToUse = existing?.data?.id;
    if (!idToUse && isValidUUID(settings.id)) {
      idToUse = settings.id;
    }
    const payload: any = {
      hospital_name: settings.hospital_name,
      address: settings.address,
      phone: settings.phone,
      token_reset_hour: settings.token_reset_hour,
      ip_hours_per_day: settings.ip_hours_per_day,
      prescription_paper_size: settings.prescription_paper_size,
      prescription_header: settings.prescription_header,
      prescription_footer: settings.prescription_footer,
      low_stock_days_warning: settings.low_stock_days_warning,
      expiry_days_warning: settings.expiry_days_warning,
      updated_at: new Date().toISOString(),
    };
    if (idToUse) payload.id = idToUse;
    await supabase.from('hospital_settings').upsert(payload);
  } catch (e) {
    console.warn('Failed to push settings to Supabase:', e);
  }
}




