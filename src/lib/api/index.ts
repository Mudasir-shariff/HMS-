import { createClient } from '@/lib/supabase/client';
import { HMSStore } from '@/lib/store/hms-store';
import type {
  Patient,
  Visit,
  Prescription,
  PrescriptionItem,
  Drug,
  Dispensing,
  DispensingItem,
  Doctor,
  User,
  Ward,
  Bed,
  Admission,
  HospitalSettings,
} from '@/lib/types/database';

export async function fetchUserProfiles(): Promise<User[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    const local = HMSStore.getUsers();
    if (local && local.length > 0) {
      return local.map((u) => ({
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
    return [];
  }
  return data;
}

export async function fetchDoctors(): Promise<Doctor[]> {
  const supabase = createClient();
  const [docsRes, profilesRes] = await Promise.all([
    supabase.from('doctors').select('*').order('created_at', { ascending: true }),
    supabase.from('user_profiles').select('*').eq('role', 'doctor'),
  ]);

  const docs = docsRes.data || [];
  const profiles = profilesRes.data || [];

  const doctorMap = new Map<string, Doctor>();

  // 1. Process records in public.doctors table
  for (const doc of docs) {
    const user = profiles.find((p: any) => p.id === doc.user_id || p.id === doc.id);
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

  // 2. Also ensure any doctor profile in user_profiles is included
  for (const prof of profiles) {
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

  if (doctorMap.size > 0) {
    return Array.from(doctorMap.values());
  }

  // Fallback to local store doctors if database is temporarily empty
  const localDocs = HMSStore.getDoctors();
  if (localDocs && localDocs.length > 0) {
    return localDocs.map((d) => ({
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

  return [];
}

export async function fetchPatients(search?: string): Promise<Patient[]> {
  const supabase = createClient();
  let query = supabase.from('patients').select('*').order('created_at', { ascending: false });

  if (search && search.trim()) {
    const s = search.trim();
    query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,uhid.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
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
  return data;
}

export async function fetchVisits(filters?: { doctorId?: string; status?: string; date?: string }): Promise<Visit[]> {
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

  const { data, error } = await query;
  const dbVisits: Visit[] = (!error && data) ? data.map((v: any) => ({
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
  })) : [];

  const localVisits = HMSStore.getVisits();
  const visitMap = new Map<string, Visit>();
  dbVisits.forEach((v) => visitMap.set(v.id, v));

  localVisits.forEach((lv) => {
    const existing = visitMap.get(lv.id);
    if (!existing) {
      visitMap.set(lv.id, lv);
    } else {
      const localTime = new Date(lv.updated_at || lv.created_at).getTime();
      const dbTime = new Date(existing.updated_at || existing.created_at).getTime();
      if (localTime > dbTime || (lv.status === 'prescribed' && existing.status !== 'prescribed')) {
        visitMap.set(lv.id, { ...existing, ...lv });
      }
    }
  });

  let results = Array.from(visitMap.values()).sort((a, b) => a.token_number - b.token_number);
  if (filters?.doctorId) {
    results = results.filter((v) => v.doctor_id === filters.doctorId);
  }
  if (filters?.status) {
    results = results.filter((v) => v.status === filters.status);
  }
  return results;
}

export async function fetchPrescriptions(visitId?: string): Promise<Prescription[]> {
  const supabase = createClient();
  let rxQuery = supabase.from('prescriptions').select('*').order('created_at', { ascending: false });
  if (visitId) {
    rxQuery = rxQuery.eq('visit_id', visitId);
  }

  const [rxRes, itemsRes, labsRes] = await Promise.all([
    rxQuery,
    supabase.from('prescription_items').select('*'),
    supabase.from('lab_test_orders').select('*'),
  ]);

  const allItems = itemsRes.data || [];
  const allLabs = labsRes.data || [];

  const dbPrescriptions: Prescription[] = (!rxRes.error && rxRes.data)
    ? rxRes.data.map((r: any) => ({
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
      }))
    : [];

  // Merge with local prescriptions to guarantee instant availability
  let local = HMSStore.getPrescriptions();
  if (visitId) {
    local = local.filter((p) => p.visit_id === visitId);
  }

  const rxMap = new Map<string, Prescription>();
  dbPrescriptions.forEach((r) => rxMap.set(r.id, r));
  local.forEach((lr) => {
    if (!rxMap.has(lr.id)) {
      rxMap.set(lr.id, lr);
    }
  });

  return Array.from(rxMap.values());
}

export async function fetchDrugs(): Promise<Drug[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('drugs')
    .select('*')
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    const local = HMSStore.getDrugs();
    return local || [];
  }

  return data.map((d: any) => ({
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
}

export async function fetchDispensings(): Promise<Dispensing[]> {
  const supabase = createClient();
  const [dispRes, itemsRes] = await Promise.all([
    supabase.from('dispensings').select('*').order('created_at', { ascending: false }),
    supabase.from('dispensing_items').select('*'),
  ]);

  if (dispRes.error || !dispRes.data || dispRes.data.length === 0) {
    return HMSStore.getDispensings() || [];
  }

  const allItems = itemsRes.data || [];
  return dispRes.data.map((d: any) => ({
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
}

export async function fetchWards(): Promise<Ward[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('wards').select('*').order('name', { ascending: true });
  if (error || !data || data.length === 0) return HMSStore.getWards() || [];
  return data;
}

export async function fetchBeds(): Promise<Bed[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('beds').select('*').order('bed_number', { ascending: true });
  if (error || !data || data.length === 0) return HMSStore.getBeds() || [];
  return data.map((b: any) => ({
    id: b.id,
    ward_id: b.ward_id,
    bed_number: b.bed_number,
    price_per_day: Number(b.price_per_day) || 0,
    is_occupied: Boolean(b.is_occupied),
    created_at: b.created_at,
  }));
}

export async function fetchAdmissions(): Promise<Admission[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('admissions').select('*').order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return HMSStore.getAdmissions() || [];
  return data;
}

export async function fetchSettings(): Promise<HospitalSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('hospital_settings').select('*').limit(1).maybeSingle();
  if (error || !data) {
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
  }
  return {
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
}
