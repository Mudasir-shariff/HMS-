import { createClient } from '@/lib/supabase/client';
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

function isValidUUID(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Fast network timeout helper (7 seconds).
 */
async function withTimeout<T>(promise: PromiseLike<T>, ms = 7000): Promise<T | null> {
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
        console.warn('Network query error:', err?.message || err);
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
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
    );
    if (!res || res.error || !res.data) return [];
    return res.data as User[];
  } catch (err) {
    console.error('fetchUserProfiles error:', err);
    return [];
  }
}

export async function fetchDoctors(): Promise<Doctor[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      Promise.allSettled([
        supabase.from('doctors').select('*').order('created_at', { ascending: true }),
        supabase.from('user_profiles').select('*').eq('role', 'doctor').is('deleted_at', null),
      ])
    );

    const docsRes = res?.[0]?.status === 'fulfilled' ? res[0].value : null;
    const profilesRes = res?.[1]?.status === 'fulfilled' ? res[1].value : null;

    const docs = docsRes?.data || [];
    const profiles = profilesRes?.data || [];

    const doctorMap = new Map<string, Doctor>();

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

    return Array.from(doctorMap.values());
  } catch (err) {
    console.error('fetchDoctors error:', err);
    return [];
  }
}

export async function fetchPatients(search?: string): Promise<Patient[]> {
  try {
    const supabase = createClient();
    let query = supabase.from('patients').select('*').is('deleted_at', null).order('created_at', { ascending: false });

    if (search !== undefined && search.trim() !== '') {
      const sanitized = search.trim().replace(/[,()]/g, '');
      if (!sanitized) {
        return [];
      }
      query = query.or(`name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,uhid.ilike.%${sanitized}%`);
    }

    const res = await withTimeout(query);
    if (!res || res.error || !res.data) return [];
    return res.data as Patient[];
  } catch (err) {
    console.error('fetchPatients error:', err);
    return [];
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
      .is('deleted_at', null)
      .order('token_number', { ascending: true });

    if (filters?.doctorId && isValidUUID(filters.doctorId)) {
      query = query.eq('doctor_id', filters.doctorId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const res = await withTimeout(query);
    if (!res || res.error || !res.data) return [];

    return res.data.map((v: any) => ({
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
  } catch (err) {
    console.error('fetchVisits error:', err);
    return [];
  }
}

export async function fetchPrescriptions(visitId?: string): Promise<Prescription[]> {
  try {
    const supabase = createClient();
    let rxQuery = supabase.from('prescriptions').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (visitId && isValidUUID(visitId)) {
      rxQuery = rxQuery.eq('visit_id', visitId);
    }

    const res = await withTimeout(
      Promise.allSettled([
        rxQuery,
        supabase.from('prescription_items').select('*').is('deleted_at', null),
        supabase.from('lab_test_orders').select('*'),
      ])
    );

    const rxSettled = res?.[0]?.status === 'fulfilled' ? res[0].value : null;
    const itemsSettled = res?.[1]?.status === 'fulfilled' ? res[1].value : null;
    const labsSettled = res?.[2]?.status === 'fulfilled' ? res[2].value : null;

    if (!rxSettled || rxSettled.error || !rxSettled.data) {
      return [];
    }

    const allItems = itemsSettled?.data || [];
    const allLabs = labsSettled?.data || [];

    return rxSettled.data.map((r: any) => ({
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
  } catch (err) {
    console.error('fetchPrescriptions error:', err);
    return [];
  }
}

export async function fetchDrugs(): Promise<Drug[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      supabase.from('drugs').select('*').is('deleted_at', null).order('name', { ascending: true })
    );
    if (!res || res.error || !res.data) return [];

    return res.data.map((d: any) => ({
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
  } catch (err) {
    console.error('fetchDrugs error:', err);
    return [];
  }
}

export async function fetchDispensings(): Promise<Dispensing[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(
      Promise.allSettled([
        supabase.from('dispensings').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('dispensing_items').select('*'),
      ])
    );

    const dispSettled = res?.[0]?.status === 'fulfilled' ? res[0].value : null;
    const itemsSettled = res?.[1]?.status === 'fulfilled' ? res[1].value : null;

    if (!dispSettled || dispSettled.error || !dispSettled.data) {
      return [];
    }

    const allItems = itemsSettled?.data || [];
    return dispSettled.data.map((d: any) => ({
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
  } catch (err) {
    console.error('fetchDispensings error:', err);
    return [];
  }
}

export async function fetchWards(): Promise<Ward[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('wards').select('*').order('name', { ascending: true }));
    if (!res || res.error || !res.data) return [];
    return res.data as Ward[];
  } catch (err) {
    console.error('fetchWards error:', err);
    return [];
  }
}

export async function fetchBeds(): Promise<Bed[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('beds').select('*').order('bed_number', { ascending: true }));
    if (!res || res.error || !res.data) return [];
    return res.data.map((b: any) => ({
      id: b.id,
      ward_id: b.ward_id,
      bed_number: b.bed_number,
      price_per_day: Number(b.price_per_day) || 0,
      is_occupied: Boolean(b.is_occupied),
      created_at: b.created_at,
    }));
  } catch (err) {
    console.error('fetchBeds error:', err);
    return [];
  }
}

export async function fetchAdmissions(): Promise<Admission[]> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('admissions').select('*').order('created_at', { ascending: false }));
    if (!res || res.error || !res.data) return [];
    return res.data as Admission[];
  } catch (err) {
    console.error('fetchAdmissions error:', err);
    return [];
  }
}

export async function fetchSettings(): Promise<HospitalSettings | null> {
  try {
    const supabase = createClient();
    const res = await withTimeout(supabase.from('hospital_settings').select('*').limit(1).maybeSingle());
    if (!res || res.error || !res.data) return null;
    const data = res.data;
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
  } catch (err) {
    console.error('fetchSettings error:', err);
    return null;
  }
}
