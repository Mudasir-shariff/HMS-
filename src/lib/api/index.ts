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
 * Guarantees that slow or dropped network requests never freeze the UI.
 */
async function withTimeout<T>(promise: PromiseLike<T>, ms = 3000): Promise<T | null> {
  let timer: any;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

export async function fetchUserProfiles(): Promise<User[]> {
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

  // Sync to local store so deletions & additions stay in sync immediately
  HMSStore.setUsers(data as any);
  return data;
}

export async function fetchDoctors(): Promise<Doctor[]> {
  const supabase = createClient();
  const res = await withTimeout(
    Promise.all([
      supabase.from('doctors').select('*').order('created_at', { ascending: true }),
      supabase.from('user_profiles').select('*').eq('role', 'doctor'),
    ]),
    3000
  );

  const docs = res?.[0]?.data;
  const profiles = res?.[1]?.data;

  if (!docs && !profiles) {
    // Only fall back to local store if network failed
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

  // 1. Process records in public.doctors table
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

  // 2. Also ensure any doctor profile in user_profiles is included
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

  return Array.from(doctorMap.values());
}

export async function fetchPatients(search?: string): Promise<Patient[]> {
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

  // If full list returned without filter, update local store so deletions match reality
  if (!search) {
    HMSStore.setPatients(data);
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

  const res = await withTimeout(query, 3000);
  const data = res?.data;
  const error = res?.error;

  if (error || !data) {
    let local = HMSStore.getVisits();
    if (filters?.doctorId) local = local.filter((v) => v.doctor_id === filters.doctorId);
    if (filters?.status) local = local.filter((v) => v.status === filters.status);
    return local;
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

  // Update local store with true remote state
  if (!filters?.doctorId && !filters?.status) {
    HMSStore.setVisits(dbVisits);
  }

  return dbVisits;
}

export async function fetchPrescriptions(visitId?: string): Promise<Prescription[]> {
  const supabase = createClient();
  let rxQuery = supabase.from('prescriptions').select('*').order('created_at', { ascending: false });
  if (visitId) {
    rxQuery = rxQuery.eq('visit_id', visitId);
  }

  const res = await withTimeout(
    Promise.all([
      rxQuery,
      supabase.from('prescription_items').select('*'),
      supabase.from('lab_test_orders').select('*'),
    ]),
    3000
  );

  const [rxRes, itemsRes, labsRes] = res || [
    { data: null, error: true },
    { data: null, error: true },
    { data: null, error: true },
  ];

  if (rxRes.error || !rxRes.data) {
    let local = HMSStore.getPrescriptions();
    if (visitId) local = local.filter((p) => p.visit_id === visitId);
    return local;
  }

  const allItems = itemsRes.data || [];
  const allLabs = labsRes.data || [];

  const dbPrescriptions: Prescription[] = rxRes.data.map((r: any) => ({
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

  if (!visitId) {
    HMSStore.setPrescriptions(dbPrescriptions);
  }

  return dbPrescriptions;
}

export async function fetchDrugs(): Promise<Drug[]> {
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

  HMSStore.setDrugs(mappedDrugs);
  return mappedDrugs;
}

export async function fetchDispensings(): Promise<Dispensing[]> {
  const supabase = createClient();
  const res = await withTimeout(
    Promise.all([
      supabase.from('dispensings').select('*').order('created_at', { ascending: false }),
      supabase.from('dispensing_items').select('*'),
    ]),
    3000
  );

  const [dispRes, itemsRes] = res || [{ data: null, error: true }, { data: null, error: true }];

  if (dispRes.error || !dispRes.data) {
    return HMSStore.getDispensings() || [];
  }

  const allItems = itemsRes.data || [];
  const mappedDisp = dispRes.data.map((d: any) => ({
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

  HMSStore.setDispensings(mappedDisp);
  return mappedDisp;
}

export async function fetchWards(): Promise<Ward[]> {
  const supabase = createClient();
  const res = await withTimeout(supabase.from('wards').select('*').order('name', { ascending: true }), 3000);
  const data = res?.data;
  const error = res?.error;
  if (error || !data) return HMSStore.getWards() || [];
  HMSStore.setWards(data);
  return data;
}

export async function fetchBeds(): Promise<Bed[]> {
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
}

export async function fetchAdmissions(): Promise<Admission[]> {
  const supabase = createClient();
  const res = await withTimeout(supabase.from('admissions').select('*').order('created_at', { ascending: false }), 3000);
  const data = res?.data;
  const error = res?.error;
  if (error || !data) return HMSStore.getAdmissions() || [];
  HMSStore.setAdmissions(data);
  return data;
}

export async function fetchSettings(): Promise<HospitalSettings | null> {
  const supabase = createClient();
  const res = await withTimeout(supabase.from('hospital_settings').select('*').limit(1).maybeSingle(), 3000);
  const data = res?.data;
  const error = res?.error;
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
}
