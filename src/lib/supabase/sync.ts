import { createClient } from './client';
import { HMSStore, UserAccount, generateUUID } from '../store/hms-store';
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
 * Pull all data from Supabase into HMSStore cache
 */
export async function syncFromSupabase(): Promise<boolean> {
  if (!isSupabaseConfigured() || isSyncing) return false;
  isSyncing = true;

  try {
    const supabase = createClient();

    // 1. Fetch Users & Doctors
    const [profilesRes, docsRes] = await Promise.all([
      supabase.from('user_profiles').select('*'),
      supabase.from('doctors').select('*'),
    ]);

    if (!profilesRes.error && profilesRes.data) {
      const docs = docsRes.data || [];
      const syncedUsers: UserAccount[] = profilesRes.data.map((p: any) => {
        const doc = docs.find((d: any) => d.user_id === p.id || d.id === p.id);
        return {
          id: p.id,
          email: p.email || (p.full_name ? `${p.full_name.toLowerCase().replace(/[^a-z0-9]/g, '')}@hospital.local` : 'user@hospital.local'),
          password: p.password || undefined,
          full_name: p.full_name,
          role: p.role as UserRole,
          phone: p.phone || undefined,
          is_active: p.is_active ?? true,
          specialization: p.specialization || doc?.specialization || undefined,
          consultation_room: p.consultation_room || doc?.consultation_room || undefined,
          consultation_fee: p.consultation_fee ? Number(p.consultation_fee) : 500,
          opd_timings: p.opd_timings || undefined,
          created_at: p.created_at || new Date().toISOString(),
        };
      });

      const localUsers = HMSStore.getUsers();
      const remoteUserIds = new Set(syncedUsers.map((u) => u.id));
      const unsyncedLocals = localUsers.filter((u) => !remoteUserIds.has(u.id));
      // Auto-push any locally registered accounts that aren't on Supabase yet
      unsyncedLocals.forEach((u) => pushUserToSupabase(u));

      HMSStore.setUsers([...syncedUsers, ...unsyncedLocals]);
    }

    // 2. Fetch Patients
    const patientsRes = await supabase.from('patients').select('*');
    if (!patientsRes.error && patientsRes.data) {
      const syncedPatients: Patient[] = patientsRes.data.map((p: any) => ({
        id: p.id,
        uhid: p.uhid,
        name: p.name,
        age: Number(p.age) || 0,
        phone: p.phone,
        blood_group: p.blood_group || undefined,
        has_bp: Boolean(p.has_bp),
        has_sugar: Boolean(p.has_sugar),
        other_conditions: p.other_conditions || undefined,
        created_at: p.created_at,
        updated_at: p.updated_at || p.created_at,
      }));

      const existingP = HMSStore.getPatients();
      const pMap = new Map<string, Patient>();
      existingP.forEach((p) => pMap.set(p.id, p));
      syncedPatients.forEach((p) => pMap.set(p.id, p));
      HMSStore.setPatients(Array.from(pMap.values()));
    }

    // 3. Fetch Visits
    const visitsRes = await supabase.from('visits').select('*');
    if (!visitsRes.error && visitsRes.data) {
      const syncedVisits: Visit[] = visitsRes.data.map((v: any) => ({
        id: v.id,
        visit_number: v.visit_number,
        patient_id: v.patient_id,
        doctor_id: v.doctor_id,
        token_number: Number(v.token_number) || 1,
        status: v.status,
        follow_up_date: v.follow_up_date || undefined,
        instructions: v.instructions || undefined,
        created_at: v.created_at,
        updated_at: v.updated_at || v.created_at,
      }));

      const existingV = HMSStore.getVisits();
      const vMap = new Map<string, Visit>();
      existingV.forEach((v) => vMap.set(v.id, v));
      syncedVisits.forEach((v) => vMap.set(v.id, v));
      HMSStore.setVisits(Array.from(vMap.values()));
    }

    // 4. Fetch Drugs
    const drugsRes = await supabase.from('drugs').select('*');
    if (!drugsRes.error && drugsRes.data) {
      const syncedDrugs: Drug[] = drugsRes.data.map((d: any) => ({
        id: d.id,
        name: d.name,
        drug_type: d.drug_type,
        custom_type_name: d.custom_type_name || undefined,
        expiry_date: d.expiry_date,
        purchase_price: Number(d.purchase_price) || 0,
        selling_price: Number(d.selling_price) || 0,
        stock_quantity: Number(d.stock_quantity) || 0,
        low_stock_limit: Number(d.low_stock_limit) || 30,
        boxes: d.boxes ? Number(d.boxes) : undefined,
        tablets_per_sheet: d.tablets_per_sheet ? Number(d.tablets_per_sheet) : undefined,
        selling_price_per_sheet: d.price_per_sheet ? Number(d.price_per_sheet) : undefined,
        batch_number: d.batch_number || undefined,
        schedule_h: Boolean(d.schedule_h),
        schedule_h1: Boolean(d.schedule_h1),
        is_active: d.is_active ?? true,
        created_at: d.created_at,
        updated_at: d.updated_at || d.created_at,
      }));

      const existingD = HMSStore.getDrugs();
      const dMap = new Map<string, Drug>();
      existingD.forEach((d) => dMap.set(d.id, d));
      syncedDrugs.forEach((d) => dMap.set(d.id, d));
      HMSStore.setDrugs(Array.from(dMap.values()));
    }

    // 5. Fetch Prescriptions & Items
    const [rxRes, itemsRes] = await Promise.all([
      supabase.from('prescriptions').select('*'),
      supabase.from('prescription_items').select('*'),
    ]);

    if (!rxRes.error && rxRes.data) {
      const allItems = itemsRes.data || [];
      const syncedRx: Prescription[] = rxRes.data.map((r: any) => {
        const items: PrescriptionItem[] = allItems
          .filter((it: any) => it.prescription_id === r.id)
          .map((it: any) => ({
            id: it.id,
            prescription_id: it.prescription_id,
            drug_id: it.drug_id || '',
            drug_name: it.drug_name,
            dose_morning: Boolean(it.dose_morning),
            dose_afternoon: Boolean(it.dose_afternoon),
            dose_night: Boolean(it.dose_night),
            dose_relation: it.dose_relation,
            num_days: Number(it.num_days) || 1,
            quantity: Number(it.quantity) || 1,
            created_at: it.created_at,
          }));

        return {
          id: r.id,
          visit_id: r.visit_id,
          doctor_id: r.doctor_id,
          patient_id: r.patient_id,
          notes: r.notes || undefined,
          created_at: r.created_at,
          items,
        };
      });

      const existingRx = HMSStore.getPrescriptions();
      const rMap = new Map<string, Prescription>();
      existingRx.forEach((r) => rMap.set(r.id, r));
      syncedRx.forEach((r) => rMap.set(r.id, r));
      HMSStore.setPrescriptions(Array.from(rMap.values()));
    }

    // 6. Fetch Dispensings & Items
    const [dispRes, dispItemsRes] = await Promise.all([
      supabase.from('dispensings').select('*'),
      supabase.from('dispensing_items').select('*'),
    ]);

    if (!dispRes.error && dispRes.data) {
      const allDispItems = dispItemsRes.data || [];
      const syncedDisp: Dispensing[] = dispRes.data.map((d: any) => {
        const items: DispensingItem[] = allDispItems
          .filter((it: any) => it.dispensing_id === d.id)
          .map((it: any) => ({
            id: it.id,
            dispensing_id: it.dispensing_id,
            drug_id: it.drug_id && it.drug_id.trim() !== '' ? it.drug_id : null,
            drug_name: it.drug_name,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            total_price: Number(it.total_price) || 0,
            created_at: it.created_at,
          }));

        return {
          id: d.id,
          prescription_id: d.prescription_id || undefined,
          patient_id: d.patient_id || undefined,
          pharmacist_id: d.pharmacist_id,
          is_walk_in: Boolean(d.is_walk_in),
          total_amount: Number(d.total_amount) || 0,
          delivered_at: d.created_at,
          created_at: d.created_at,
          updated_at: d.updated_at || d.created_at,
          items,
        };
      });

      const existingDisp = HMSStore.getDispensings();
      const dispMap = new Map<string, Dispensing>();
      existingDisp.forEach((d) => dispMap.set(d.id, d));
      syncedDisp.forEach((d) => dispMap.set(d.id, d));
      HMSStore.setDispensings(Array.from(dispMap.values()));
    }

    // 7. Fetch Settings
    const settingsRes = await supabase.from('hospital_settings').select('*').limit(1).single();
    if (!settingsRes.error && settingsRes.data) {
      HMSStore.saveSettings({
        id: settingsRes.data.id || 'settings-1',
        hospital_name: settingsRes.data.hospital_name || 'RADHAKRISHNA HOSPITAL',
        address: settingsRes.data.address || '',
        phone: settingsRes.data.phone || '',
        token_reset_hour: settingsRes.data.token_reset_hour ?? 0,
        ip_hours_per_day: settingsRes.data.ip_hours_per_day ?? 18,
        prescription_paper_size: settingsRes.data.prescription_paper_size || 'A4',
        prescription_header: settingsRes.data.prescription_header || 'MULTISPECIALITY CARE',
        prescription_footer: settingsRes.data.prescription_footer || "Please follow the doctor's advice.",
        default_printer: 'Pharmacy LaserJet Pro (Network)',
        schedule_h_action: 'warn',
        whatsapp_enabled: true,
        whatsapp_template: 'Namaste {patient_name}, your token at {hospital_name} is #{token}.',
        low_stock_days_warning: settingsRes.data.low_stock_days_warning ?? 7,
        expiry_days_warning: settingsRes.data.expiry_days_warning || [90, 60, 30],
        updated_at: settingsRes.data.updated_at || new Date().toISOString(),
      });
    }

    return true;
  } catch (err) {
    console.warn('Supabase sync warning (running offline fallback):', err);
    return false;
  } finally {
    isSyncing = false;
  }
}

/**
 * Setup Realtime channel to listen to changes on Supabase
 */
export function initSupabaseRealtime() {
  if (typeof window === 'undefined' || !isSupabaseConfigured() || isRealtimeSubscribed) return;
  isRealtimeSubscribed = true;

  try {
    const supabase = createClient();
    supabase
      .channel('hms-db-live-v2')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drugs' }, () => {
        syncFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispensings' }, () => {
        syncFromSupabase();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('⚡ Realtime connected to Supabase live channels');
        }
      });
  } catch (e) {
    console.warn('Realtime subscription not active', e);
  }
}

// ── Background Push Helpers (Fire & Forget, Graceful offline fallback) ──

function isValidUUID(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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

export async function pushPatientToSupabase(patient: Patient) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const patientId = isValidUUID(patient.id) ? patient.id : generateUUID();
    const { error } = await supabase.from('patients').upsert({
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
    });
    if (error) console.error('Error pushing patient to Supabase:', error);
  } catch (e) {
    console.warn('Failed to push patient to Supabase:', e);
  }
}

export async function pushVisitToSupabase(visit: Visit) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const visitId = isValidUUID(visit.id) ? visit.id : generateUUID();

    // Quick direct status update if record already exists
    if (isValidUUID(visit.id)) {
      const { data: updated, error: uErr } = await supabase
        .from('visits')
        .update({
          status: visit.status,
          follow_up_date: visit.follow_up_date || null,
          instructions: visit.instructions || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', visitId)
        .select('id')
        .maybeSingle();

      if (!uErr && updated) {
        return;
      }
    }

    // Resolve doctor: Ensure the doctor exists in public.doctors so foreign key never fails
    let doctorIdToUse = visit.doctor_id;
    if (isValidUUID(visit.doctor_id)) {
      const { data: existingDoc } = await supabase
        .from('doctors')
        .select('id, user_id')
        .or(`id.eq.${visit.doctor_id},user_id.eq.${visit.doctor_id}`)
        .limit(1)
        .maybeSingle();

      if (existingDoc) {
        doctorIdToUse = existingDoc.id;
      } else {
        // Auto-provision doctor record so foreign key doesn't reject
        const { data: newDoc } = await supabase
          .from('doctors')
          .insert({
            id: visit.doctor_id,
            user_id: visit.doctor_id,
            specialization: 'General Medicine',
            consultation_room: 'Room 1',
            is_available: true,
          })
          .select('id')
          .maybeSingle();
        if (newDoc) doctorIdToUse = newDoc.id;
      }
    }

    const { error } = await supabase.from('visits').upsert({
      id: visitId,
      visit_number: visit.visit_number,
      patient_id: visit.patient_id,
      doctor_id: doctorIdToUse,
      token_number: visit.token_number,
      status: visit.status,
      follow_up_date: visit.follow_up_date || null,
      instructions: visit.instructions || null,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('Error pushing visit to Supabase:', error);
  } catch (e) {
    console.warn('Failed to push visit to Supabase:', e);
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

export async function pushPrescriptionToSupabase(rx: Prescription) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const rxId = isValidUUID(rx.id) ? rx.id : generateUUID();

    // Resolve doctor_id to ensure foreign key passes
    let doctorIdToUse = rx.doctor_id;
    if (isValidUUID(rx.doctor_id)) {
      const { data: existingDoc } = await supabase
        .from('doctors')
        .select('id, user_id')
        .or(`id.eq.${rx.doctor_id},user_id.eq.${rx.doctor_id}`)
        .limit(1)
        .maybeSingle();
      if (existingDoc) doctorIdToUse = existingDoc.id;
    }

    let { error: rxErr } = await supabase.from('prescriptions').upsert({
      id: rxId,
      visit_id: isValidUUID(rx.visit_id) ? rx.visit_id : null,
      doctor_id: isValidUUID(doctorIdToUse) ? doctorIdToUse : null,
      patient_id: isValidUUID(rx.patient_id) ? rx.patient_id : null,
      notes: rx.notes || null,
      uaid: rx.uaid || null,
      stay_day_number: rx.stay_day_number || null,
      updated_at: new Date().toISOString(),
    });
    if (rxErr) {
      console.warn('Prescription full upsert warning, retrying core schema:', rxErr.message);
      const { error: coreErr } = await supabase.from('prescriptions').upsert({
        id: rxId,
        visit_id: isValidUUID(rx.visit_id) ? rx.visit_id : null,
        doctor_id: isValidUUID(doctorIdToUse) ? doctorIdToUse : null,
        patient_id: isValidUUID(rx.patient_id) ? rx.patient_id : null,
        notes: rx.notes || null,
      });
      if (coreErr) console.error('Core prescription upsert failed:', coreErr);
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
      let { error: itemsErr } = await supabase.from('prescription_items').upsert(itemsPayload);
      if (itemsErr) {
        console.warn('Items full upsert warning, retrying core schema:', itemsErr.message);
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
        const { error: coreItemsErr } = await supabase.from('prescription_items').upsert(coreItems);
        if (coreItemsErr) console.error('Core items upsert failed:', coreItemsErr);
      }
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
    await supabase.from('hospital_settings').upsert({
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
    });
  } catch (e) {
    console.warn('Failed to push settings to Supabase:', e);
  }
}

// ── Wire HMSStore push & delete hooks to Supabase ──
if (typeof window !== 'undefined') {
  HMSStore._onSaveUser = pushUserToSupabase;
  HMSStore._onDeleteUser = deleteUserFromSupabase;
  HMSStore._onSavePatient = pushPatientToSupabase;
  HMSStore._onDeletePatient = deletePatientFromSupabase;
  HMSStore._onSaveVisit = pushVisitToSupabase;
  HMSStore._onDeleteVisit = deleteVisitFromSupabase;
  HMSStore._onSaveDrug = pushDrugToSupabase;
  HMSStore._onDeleteDrug = deleteDrugFromSupabase;
  HMSStore._onSavePrescription = pushPrescriptionToSupabase;
  HMSStore._onDeletePrescription = deletePrescriptionFromSupabase;
  HMSStore._onSaveDispensing = pushDispensingToSupabase;
  HMSStore._onSaveAdmission = pushAdmissionToSupabase;
  HMSStore._onSaveSettings = pushSettingsToSupabase;
  HMSStore._onPurgeAll = purgeAllRecordsFromSupabase;
}

