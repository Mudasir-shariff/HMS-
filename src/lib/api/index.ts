import { createClient } from '@/lib/supabase/client';
import { HMSStore } from '@/lib/store/hms-store';
import type {
  Patient,
  Visit,
  Prescription,
  PrescriptionItem,
  Drug,
  Dispensing,
  Doctor,
  User,
  Ward,
  Bed,
  Admission,
  HospitalSettings,
} from '@/lib/types/database';

/**
 * Fast network timeout helper (3 seconds).
 * Safely catches network rejections (DNS failure, offline, timeouts) so
 * promises never throw and always cleanly fall back to local store.
 */
async function withTimeout<T>(promise: PromiseLike<T>, ms = 3000): Promise<T | null> {
  let timer: any;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([
    Promise.resolve(promise)
      .then((res) => {
        clearTimeout(timer);
        return res;
      })
      .catch((err) => {
        clearTimeout(timer);
        console.debug('Network query caught error / offline:', err?.message || err);
        return null;
      }),
    timeoutPromise,
  ]);
}

export async function fetchUserProfiles(): Promise<User[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false }),
      3000
    );
    const data = res?.data;
    const error = res?.error;

    if (error || !data) {
      const local = HMSStore.getUsers();
      return (local || []).map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        phone: u.phone,
        specialization: u.specialization,
        consultation_room: u.consultation_room,
        consultation_fee: u.consultation_fee,
        opd_timings: u.opd_timings,
        is_active: u.is_active,
        created_at: u.created_at,
      }));
    }

    if (data.length > 0) {
      HMSStore.setUsers(data as any);
    }
    return data;
  } catch {
    const local = HMSStore.getUsers();
    return (local || []).map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      phone: u.phone,
      specialization: u.specialization,
      consultation_room: u.consultation_room,
      consultation_fee: u.consultation_fee,
      opd_timings: u.opd_timings,
      is_active: u.is_active,
      created_at: u.created_at,
    }));
  }
}

export async function fetchDoctors(): Promise<Doctor[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      Promise.allSettled([
        supabase.from('doctors').select('*').order('created_at', { ascending: true }),
        supabase.from('user_profiles').select('*').eq('role', 'doctor'),
      ]),
      3000
    );

    const docsRes = res?.[0]?.status === 'fulfilled' ? res[0].value : null;
    const profilesRes = res?.[1]?.status === 'fulfilled' ? res[1].value : null;

    const docs = docsRes?.data;
    const profiles = profilesRes?.data;

    if (!docs && !profiles) {
      const localDocs = HMSStore.getDoctors();
      return (localDocs || []).map((d) => ({
        id: d.id,
        user_id: d.id,
        full_name: d.full_name,
        specialization: d.specialization,
        consultation_room: d.consultation_room,
        consultation_fee: d.consultation_fee ?? 500,
        opd_timings: d.opd_timings,
        is_available: (d as any).is_available ?? d.is_active ?? true,
        created_at: d.created_at,
      }));
    }

    const doctorMap = new Map<string, Doctor>();

    for (const doc of docs || []) {
      const user = (profiles || []).find((p: any) => p.id === doc.user_id || p.id === doc.id);
      const key = doc.id || doc.user_id;
      doctorMap.set(key, {
        id: doc.id,
        user_id: doc.user_id || doc.id,
        full_name: doc.full_name || user?.full_name || 'Dr. Consultant',
        specialization: doc.specialization || user?.specialization || 'General Medicine',
        consultation_room: doc.consultation_room || user?.consultation_room || 'Room 1',
        consultation_fee: doc.consultation_fee ?? user?.consultation_fee ?? 500,
        opd_timings: doc.opd_timings || user?.opd_timings || '09:00 AM - 01:00 PM',
        is_available: doc.is_available ?? true,
        created_at: doc.created_at,
        user: user
          ? {
              id: user.id,
              email: user.email || '',
              full_name: user.full_name,
              role: user.role,
              phone: user.phone || undefined,
              specialization: user.specialization,
              consultation_room: user.consultation_room,
              consultation_fee: user.consultation_fee,
              opd_timings: user.opd_timings,
              is_active: user.is_active,
              created_at: user.created_at,
            }
          : undefined,
      });
    }

    for (const prof of profiles || []) {
      if (!doctorMap.has(prof.id)) {
        doctorMap.set(prof.id, {
          id: prof.id,
          user_id: prof.id,
          full_name: prof.full_name,
          specialization: prof.specialization || 'General Medicine',
          consultation_room: prof.consultation_room || 'Room 1',
          consultation_fee: prof.consultation_fee ?? 500,
          opd_timings: prof.opd_timings || '09:00 AM - 01:00 PM',
          is_available: prof.is_active ?? true,
          created_at: prof.created_at,
          user: {
            id: prof.id,
            email: prof.email || '',
            full_name: prof.full_name,
            role: prof.role,
            phone: prof.phone || undefined,
            specialization: prof.specialization,
            consultation_room: prof.consultation_room,
            consultation_fee: prof.consultation_fee,
            opd_timings: prof.opd_timings,
            is_active: prof.is_active,
            created_at: prof.created_at,
          },
        });
      }
    }

    const result = Array.from(doctorMap.values());
    if (result.length === 0) {
      const localDocs = HMSStore.getDoctors();
      return (localDocs || []).map((d) => ({
        id: d.id,
        user_id: d.id,
        full_name: d.full_name,
        specialization: d.specialization,
        consultation_room: d.consultation_room,
        consultation_fee: d.consultation_fee ?? 500,
        opd_timings: d.opd_timings,
        is_available: (d as any).is_available ?? d.is_active ?? true,
        created_at: d.created_at,
      }));
    }
    return result;
  } catch {
    const localDocs = HMSStore.getDoctors();
    return (localDocs || []).map((d) => ({
      id: d.id,
      user_id: d.id,
      full_name: d.full_name,
      specialization: d.specialization,
      consultation_room: d.consultation_room,
      consultation_fee: d.consultation_fee ?? 500,
      opd_timings: d.opd_timings,
      is_available: (d as any).is_available ?? d.is_active ?? true,
      created_at: d.created_at,
    }));
  }
}

export async function fetchPatients(search?: string): Promise<Patient[]> {
  try {
    const supabase = createClient();
    let query = supabase.from('patients').select('*').order('created_at', { ascending: false });

    if (search && search.trim()) {
      const s = search.trim();
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,uhid.ilike.%${s}%`);
    }

    const res = await withTimeout(query, 3000);
    const data = res?.data;
    const error = res?.error;

    if (error || !data) {
      const local = HMSStore.getPatients();
      if (search && search.trim()) {
        const s = search.trim().toLowerCase();
        return local.filter(
          (p) =>
            p.name.toLowerCase().includes(s) ||
            p.phone.includes(s) ||
            p.uhid.toLowerCase().includes(s)
        );
      }
      return local || [];
    }

    // Merge with local patients so newly registered patients on this device appear instantly
    const localPatients = HMSStore.getPatients();
    const patMap = new Map<string, Patient>();
    data.forEach((p) => patMap.set(p.id, p));
    localPatients.forEach((lp) => {
      if (!patMap.has(lp.id)) patMap.set(lp.id, lp);
    });

    const merged = Array.from(patMap.values());
    if (!search) {
      HMSStore.setPatients(merged);
    }
    return merged;
  } catch {
    const local = HMSStore.getPatients();
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      return local.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.phone.includes(s) ||
          p.uhid.toLowerCase().includes(s)
      );
    }
    return local || [];
  }
}

export async function fetchVisits(filters?: { doctorId?: string; status?: string; date?: string }): Promise<Visit[]> {
  try {
    const supabase = createClient();
    let query = supabase
      .from('visits')
      .select(`
        id,
        visit_number,
        patient_id,
        doctor_id,
        token_number,
        status,
        follow_up_date,
        instructions,
        created_at,
        updated_at
      `)
      .order('token_number', { ascending: true });

    if (filters?.doctorId) {
      query = query.eq('doctor_id', filters.doctorId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const res = await withTimeout(query, 3000);
    const data = res?.data;
    const error = res?.error;

    if (error || !data) {
      let local = HMSStore.getVisits();
      if (filters?.doctorId) local = local.filter((v) => v.doctor_id === filters.doctorId);
      if (filters?.status) local = local.filter((v) => v.status === filters.status);
      return local || [];
    }

    const dbVisits: Visit[] = data.map((v: any) => ({
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

    // Guaranteed consistency: Merge local visits with DB
    // If a visit was moved to 'prescribed' by Doctor, KEEP 'prescribed' so Pharmacy queue sees it!
    const localVisits = HMSStore.getVisits();
    const visitMap = new Map<string, Visit>();
    dbVisits.forEach((v) => visitMap.set(v.id, v));

    localVisits.forEach((lv) => {
      const existing = visitMap.get(lv.id);
      if (!existing) {
        visitMap.set(lv.id, lv);
      } else {
        if (
          lv.status === 'prescribed' &&
          existing.status !== 'prescribed' &&
          existing.status !== 'dispensed' &&
          existing.status !== 'completed'
        ) {
          visitMap.set(lv.id, { ...existing, status: 'prescribed' });
        }
      }
    });

    const finalVisits = Array.from(visitMap.values()).sort((a, b) => a.token_number - b.token_number);
    if (!filters?.doctorId && !filters?.status) {
      HMSStore.setVisits(finalVisits);
    }

    let results = finalVisits;
    if (filters?.doctorId) results = results.filter((v) => v.doctor_id === filters.doctorId);
    if (filters?.status) results = results.filter((v) => v.status === filters.status);
    return results;
  } catch (err) {
    console.warn('fetchVisits exception, using local store:', err);
    let local = HMSStore.getVisits();
    if (filters?.doctorId) local = local.filter((v) => v.doctor_id === filters.doctorId);
    if (filters?.status) local = local.filter((v) => v.status === filters.status);
    return local || [];
  }
}

export async function fetchPrescriptions(visitId?: string): Promise<Prescription[]> {
  try {
    const supabase = createClient();
    let rxQuery = supabase.from('prescriptions').select('*').order('created_at', { ascending: false });
    if (visitId) {
      rxQuery = rxQuery.eq('visit_id', visitId);
    }

    const res = await withTimeout(
      Promise.allSettled([
        rxQuery,
        supabase.from('prescription_items').select('*'),
        supabase.from('lab_test_orders').select('*'),
      ]),
      3000
    );

    const rxSettled = res?.[0]?.status === 'fulfilled' ? res[0].value : null;
    const itemsSettled = res?.[1]?.status === 'fulfilled' ? res[1].value : null;
    const labsSettled = res?.[2]?.status === 'fulfilled' ? res[2].value : null;

    if (!rxSettled || rxSettled.error || !rxSettled.data) {
      let local = HMSStore.getPrescriptions();
      if (visitId) local = local.filter((p) => p.visit_id === visitId);
      return local || [];
    }

    const allItems = itemsSettled?.data || [];
    const allLabs = labsSettled?.data || [];

    const dbPrescriptions: Prescription[] = rxSettled.data.map((r: any) => ({
      id: r.id,
      visit_id: r.visit_id,
      doctor_id: r.doctor_id,
      patient_id: r.patient_id,
      notes: r.notes || undefined,
      uaid: r.uaid || undefined,
      stay_day_number: r.stay_day_number || undefined,
      created_at: r.created_at,
      items: allItems
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
          quantity: it.quantity ? Number(it.quantity) : undefined,
          is_custom: Boolean(it.is_custom),
          item_type: it.item_type || undefined,
          custom_unit: it.custom_unit || undefined,
          added_by_pharmacist: Boolean(it.added_by_pharmacist),
          pharmacist_notes: it.pharmacist_notes || undefined,
          created_at: it.created_at,
        })),
      lab_tests: allLabs
        .filter((lt: any) => lt.prescription_id === r.id)
        .map((lt: any) => ({
          id: lt.id,
          prescription_id: lt.prescription_id,
          test_name: lt.test_name,
          notes: lt.notes || undefined,
          created_at: lt.created_at,
        })),
    }));

    // Merge with local store so any prescription created by Doctor on this system is NEVER lost
    const local = HMSStore.getPrescriptions();
    const rxMap = new Map<string, Prescription>();
    dbPrescriptions.forEach((r) => rxMap.set(r.id, r));
    local.forEach((lr) => {
      const existing = rxMap.get(lr.id);
      if (!existing) {
        rxMap.set(lr.id, lr);
      } else if ((!existing.items || existing.items.length === 0) && lr.items && lr.items.length > 0) {
        rxMap.set(lr.id, { ...existing, items: lr.items });
      }
    });

    const merged = Array.from(rxMap.values());
    if (!visitId) {
      HMSStore.setPrescriptions(merged);
    }
    return visitId ? merged.filter((p) => p.visit_id === visitId) : merged;
  } catch (err) {
    console.warn('fetchPrescriptions exception, using local store:', err);
    let local = HMSStore.getPrescriptions();
    if (visitId) local = local.filter((p) => p.visit_id === visitId);
    return local || [];
  }
}

export async function fetchDrugs(): Promise<Drug[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      supabase.from('drugs').select('*').order('name', { ascending: true }),
      3000
    );
    const data = res?.data;
    const error = res?.error;

    if (error || !data) {
      return HMSStore.getDrugs() || [];
    }

    const mappedDrugs: Drug[] = data.map((d: any) => ({
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
      supplier: d.supplier || undefined,
      unit: d.unit || undefined,
      schedule_h: Boolean(d.schedule_h),
      schedule_h1: Boolean(d.schedule_h1),
      is_active: d.is_active ?? true,
      created_at: d.created_at,
      updated_at: d.updated_at || d.created_at,
    }));

    if (mappedDrugs.length > 0) {
      HMSStore.setDrugs(mappedDrugs);
    }
    return mappedDrugs;
  } catch {
    return HMSStore.getDrugs() || [];
  }
}

export async function fetchDispensings(): Promise<Dispensing[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      Promise.allSettled([
        supabase.from('dispensings').select('*').order('created_at', { ascending: false }),
        supabase.from('dispensing_items').select('*'),
      ]),
      3000
    );

    const dispSettled = res?.[0]?.status === 'fulfilled' ? res[0].value : null;
    const itemsSettled = res?.[1]?.status === 'fulfilled' ? res[1].value : null;

    if (!dispSettled || dispSettled.error || !dispSettled.data) {
      return HMSStore.getDispensings() || [];
    }

    const allItems = itemsSettled?.data || [];
    const mappedDisp = dispSettled.data.map((d: any) => ({
      id: d.id,
      prescription_id: d.prescription_id || undefined,
      patient_id: d.patient_id || undefined,
      pharmacist_id: d.pharmacist_id,
      pharmacist_name: d.pharmacist_name || undefined,
      patient_name: d.patient_name || undefined,
      patient_phone: d.patient_phone || undefined,
      patient_uhid: d.patient_uhid || undefined,
      is_walk_in: Boolean(d.is_walk_in),
      total_amount: Number(d.total_amount) || 0,
      delivered_at: d.created_at,
      created_at: d.created_at,
      updated_at: d.updated_at || d.created_at,
      items: allItems
        .filter((it: any) => it.dispensing_id === d.id)
        .map((it: any) => ({
          id: it.id,
          dispensing_id: it.dispensing_id,
          drug_id: it.drug_id || '',
          drug_name: it.drug_name,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0,
          is_custom: Boolean(it.is_custom),
          created_at: it.created_at,
        })),
    }));

    // Merge with local dispensings so recent sales remain visible
    const localDisp = HMSStore.getDispensings();
    const dispMap = new Map<string, Dispensing>();
    mappedDisp.forEach((d) => dispMap.set(d.id, d));
    localDisp.forEach((ld) => {
      if (!dispMap.has(ld.id)) dispMap.set(ld.id, ld);
    });

    const finalDisp = Array.from(dispMap.values());
    HMSStore.setDispensings(finalDisp);
    return finalDisp;
  } catch {
    return HMSStore.getDispensings() || [];
  }
}

export async function fetchWards(): Promise<Ward[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('wards').select('*').order('name', { ascending: true }), 3000);
    const data = res?.data;
    const error = res?.error;
    if (error || !data) return HMSStore.getWards() || [];
    HMSStore.setWards(data);
    return data;
  } catch {
    return HMSStore.getWards() || [];
  }
}

export async function fetchBeds(): Promise<Bed[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('beds').select('*').order('bed_number', { ascending: true }), 3000);
    const data = res?.data;
    const error = res?.error;
    if (error || !data) return HMSStore.getBeds() || [];
    const beds = data.map((b: any) => ({
      id: b.id,
      ward_id: b.ward_id,
      bed_number: b.bed_number,
      price_per_day: Number(b.price_per_day) || 0,
      is_occupied: Boolean(b.is_occupied),
      created_at: b.created_at,
    }));
    HMSStore.setBeds(beds);
    return beds;
  } catch {
    return HMSStore.getBeds() || [];
  }
}

export async function fetchAdmissions(): Promise<Admission[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('admissions').select('*').order('created_at', { ascending: false }), 3000);
    const data = res?.data;
    const error = res?.error;
    if (error || !data) return HMSStore.getAdmissions() || [];
    HMSStore.setAdmissions(data);
    return data;
  } catch {
    return HMSStore.getAdmissions() || [];
  }
}

export async function fetchSettings(): Promise<HospitalSettings | null> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('hospital_settings').select('*').limit(1).maybeSingle(), 3000);
    const data = res?.data;
    const error = res?.error;
    if (error || !data) {
      return HMSStore.getSettings();
    }
    const settings: HospitalSettings = {
      id: data.id,
      hospital_name: data.hospital_name || 'RADHAKRISHNA HOSPITAL',
      address: data.address || '',
      phone: data.phone || '',
      token_reset_hour: data.token_reset_hour ?? 0,
      ip_hours_per_day: data.ip_hours_per_day ?? 18,
      prescription_paper_size: data.prescription_paper_size || 'A4',
      prescription_header: data.prescription_header || 'MULTISPECIALITY CARE',
      prescription_footer: data.prescription_footer || "Please follow the doctor's advice.",
      default_printer: data.default_printer || 'Pharmacy LaserJet Pro (Network)',
      schedule_h_action: data.schedule_h_action || 'warn',
      whatsapp_enabled: data.whatsapp_enabled ?? true,
      whatsapp_template: data.whatsapp_template || 'Namaste {patient_name}, your token at {hospital_name} is #{token}.',
      low_stock_days_warning: data.low_stock_days_warning ?? 7,
      expiry_days_warning: data.expiry_days_warning || [90, 60, 30],
      updated_at: data.updated_at || new Date().toISOString(),
    };
    HMSStore.saveSettings(settings);
    return settings;
  } catch {
    return HMSStore.getSettings();
  }
}
