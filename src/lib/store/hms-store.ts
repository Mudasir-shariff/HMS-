import type {
  UserRole,
  VisitStatus,
  Patient,
  Visit,
  Doctor,
  Prescription,
  PrescriptionItem,
  LabTestOrder,
  Drug,
  Dispensing,
  Ward,
  Bed,
  Admission,
  HospitalSettings,
} from '@/lib/types/database';

export interface UserAccount {
  id: string;
  email: string;
  password?: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  is_active: boolean;
  specialization?: string;
  consultation_room?: string;
  consultation_fee?: number;
  opd_timings?: string;
  qualification?: string;
  reg_number?: string;
  created_at: string;
}

// ── Initial Seed Data ──
const DEFAULT_USERS: UserAccount[] = [];

const DEFAULT_PATIENTS: Patient[] = [];

const DEFAULT_VISITS: Visit[] = [];

const DEFAULT_PRESCRIPTIONS: Prescription[] = [];

const DEFAULT_DRUGS: Drug[] = [];

const DEFAULT_WARDS: Ward[] = [];

const DEFAULT_BEDS: Bed[] = [];

const DEFAULT_ADMISSIONS: Admission[] = [];

const DEFAULT_SETTINGS: HospitalSettings = {
  id: 'settings-1',
  hospital_name: 'RADHAKRISHNA HOSPITAL',
  hospital_logo_url: '',
  address: 'Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka',
  phone: '+91 8154 252222',
  token_reset_hour: 0,
  ip_hours_per_day: 18,
  prescription_paper_size: 'A4',
  prescription_header: 'MULTISPECIALITY CARE',
  prescription_footer: "Please follow the doctor's advice. Consult the hospital if symptoms worsen.",
  default_printer: 'Pharmacy LaserJet Pro (Network)',
  schedule_h_action: 'warn',
  whatsapp_enabled: true,
  whatsapp_template: 'Namaste {patient_name}, your token at {hospital_name} is #{token} for {doctor_name}. Follow-up scheduled on {follow_up_date}.',
  low_stock_days_warning: 7,
  expiry_days_warning: [90, 60, 30],
  updated_at: '2026-10-31T00:00:00Z',
};

// ── Storage Keys ──
const STORAGE_PREFIX = 'hms_data_';
const SESSION_KEY = 'hms_active_user';

function getStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function setStorage<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('hms-store-change', { detail: { key, data } }));
  } catch (err) {
    console.error('Storage write error', err);
  }
}

const PRODUCTION_CLEAN_KEY = 'hms_production_v5_clean';

function checkAndInitializeProductionStorage() {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem(PRODUCTION_CLEAN_KEY)) {
      // Purge all legacy dummy records
      localStorage.removeItem(STORAGE_PREFIX + 'patients');
      localStorage.removeItem(STORAGE_PREFIX + 'visits');
      localStorage.removeItem(STORAGE_PREFIX + 'prescriptions');
      localStorage.removeItem(STORAGE_PREFIX + 'admissions');
      localStorage.removeItem(STORAGE_PREFIX + 'dispensings');

      // Purge legacy dummy mock accounts
      const dummyIds = ['user-admin', 'user-rec-1', 'user-doc-1', 'user-doc-2', 'user-doc-3', 'user-pharm-1'];
      const rawUsers = localStorage.getItem(STORAGE_PREFIX + 'users');
      if (rawUsers) {
        try {
          const parsed = JSON.parse(rawUsers);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((u: any) => !dummyIds.includes(u.id));
            localStorage.setItem(STORAGE_PREFIX + 'users', JSON.stringify(cleaned));
          }
        } catch {
          localStorage.removeItem(STORAGE_PREFIX + 'users');
        }
      }

      // Purge legacy mock drugs with test batch numbers
      const dummyDrugIds = ['drug-1', 'drug-2', 'drug-3', 'drug-4', 'drug-5', 'drug-6', 'drug-7', 'drug-8'];
      const rawDrugs = localStorage.getItem(STORAGE_PREFIX + 'drugs');
      if (rawDrugs) {
        try {
          const parsedDrugs = JSON.parse(rawDrugs);
          if (Array.isArray(parsedDrugs)) {
            const cleanedDrugs = parsedDrugs.filter((d: any) => !dummyDrugIds.includes(d.id));
            localStorage.setItem(STORAGE_PREFIX + 'drugs', JSON.stringify(cleanedDrugs));
          }
        } catch {
          localStorage.removeItem(STORAGE_PREFIX + 'drugs');
        }
      }

      // Purge active user session if it was a legacy dummy account
      const activeRaw = localStorage.getItem(SESSION_KEY);
      if (activeRaw) {
        try {
          const active = JSON.parse(activeRaw);
          if (dummyIds.includes(active?.id)) {
            localStorage.removeItem(SESSION_KEY);
            document.cookie = 'hms_role=; path=/; max-age=0';
            document.cookie = 'hms_user_id=; path=/; max-age=0';
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }

      // Reset all beds to vacant
      const cleanBeds = DEFAULT_BEDS.map((b) => ({ ...b, is_occupied: false }));
      localStorage.setItem(STORAGE_PREFIX + 'beds', JSON.stringify(cleanBeds));

      localStorage.setItem(PRODUCTION_CLEAN_KEY, 'true');
    }
  } catch (e) {
    console.error('Failed to initialize production storage', e);
  }
}

// Auto-run cleanup on initial load
checkAndInitializeProductionStorage();

export const HMSStore = {
  // ── Supabase Background Push Hooks ──
  _onSaveUser: undefined as ((user: UserAccount) => void) | undefined,
  _onDeleteUser: undefined as ((userId: string) => void) | undefined,
  _onSavePatient: undefined as ((patient: Patient) => void) | undefined,
  _onDeletePatient: undefined as ((patientId: string) => void) | undefined,
  _onSaveVisit: undefined as ((visit: Visit) => void) | undefined,
  _onDeleteVisit: undefined as ((visitId: string) => void) | undefined,
  _onSaveDrug: undefined as ((drug: Drug) => void) | undefined,
  _onDeleteDrug: undefined as ((drugId: string) => void) | undefined,
  _onSavePrescription: undefined as ((rx: Prescription) => void) | undefined,
  _onDeletePrescription: undefined as ((rxId: string) => void) | undefined,
  _onSaveDispensing: undefined as ((disp: Dispensing) => void) | undefined,
  _onSaveAdmission: undefined as ((adm: Admission) => void) | undefined,
  _onSaveSettings: undefined as ((settings: HospitalSettings) => void) | undefined,
  _onPurgeAll: undefined as (() => void) | undefined,

  // ── Session ──
  getCurrentUser(): UserAccount | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role && !document.cookie.includes('hms_role=')) {
          document.cookie = `hms_role=${parsed.role}; path=/; max-age=86400`;
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: UserAccount | null) {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      document.cookie = `hms_role=${user.role}; path=/; max-age=86400`;
      document.cookie = `hms_user_id=${user.id}; path=/; max-age=86400`;
    } else {
      localStorage.removeItem(SESSION_KEY);
      document.cookie = 'hms_role=; path=/; max-age=0';
      document.cookie = 'hms_user_id=; path=/; max-age=0';
    }
    window.dispatchEvent(new CustomEvent('hms-store-change', { detail: { key: 'session' } }));
  },

  login(email: string, password?: string): { success: boolean; user?: UserAccount; error?: string } {
    const users = this.getUsers();
    if (users.length === 0) {
      return { success: false, error: 'No registered accounts found in the system. Please click Register below to create your account.' };
    }
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return { success: false, error: 'User with this email not found.' };
    }
    if (!user.is_active) {
      return { success: false, error: 'This account has been deactivated by the administrator.' };
    }
    if (user.password && password && user.password !== password) {
      return { success: false, error: 'Incorrect password. Please verify and try again.' };
    }
    this.setCurrentUser(user);
    return { success: true, user };
  },

  // ── Users (Staff) ──
  getUsers(): UserAccount[] {
    return getStorage<UserAccount[]>('users', DEFAULT_USERS);
  },

  setUsers(users: UserAccount[]) {
    setStorage('users', users);
  },

  saveUser(user: UserAccount) {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    setStorage('users', users);
    if (this._onSaveUser) this._onSaveUser(user);
  },

  deleteUser(userId: string) {
    const users = this.getUsers().filter((u) => u.id !== userId);
    setStorage('users', users);
    if (this._onDeleteUser) this._onDeleteUser(userId);
  },

  getDoctors(): UserAccount[] {
    return this.getUsers().filter((u) => u.role === 'doctor' && u.is_active);
  },

  // ── Patients ──
  getPatients(): Patient[] {
    return getStorage<Patient[]>('patients', DEFAULT_PATIENTS);
  },

  setPatients(patients: Patient[]) {
    setStorage('patients', patients);
  },

  getPatientById(id: string): Patient | undefined {
    return this.getPatients().find((p) => p.id === id);
  },

  savePatient(patient: Patient) {
    const patients = this.getPatients();
    const idx = patients.findIndex((p) => p.id === patient.id);
    if (idx >= 0) {
      patients[idx] = patient;
    } else {
      patients.unshift(patient);
    }
    setStorage('patients', patients);
    if (this._onSavePatient) this._onSavePatient(patient);
  },

  deletePatient(patientId: string) {
    const patients = this.getPatients().filter((p) => p.id !== patientId);
    setStorage('patients', patients);
    // Also remove associated visits
    const visits = this.getVisits().filter((v) => v.patient_id !== patientId);
    setStorage('visits', visits);
    if (this._onDeletePatient) this._onDeletePatient(patientId);
  },

  // ── Visits (OPD) ──
  getVisits(): Visit[] {
    const raw = getStorage<Visit[]>('visits', DEFAULT_VISITS);
    // Guarantee uniqueness of tokens and enforce strict ascending order everywhere
    const seenTokens = new Set<number>();
    let maxSeenToken = 0;
    const sanitized = raw.map((v) => {
      let token = Number(v.token_number) || 1;
      if (seenTokens.has(token)) {
        token = maxSeenToken + 1;
      }
      seenTokens.add(token);
      if (token > maxSeenToken) maxSeenToken = token;
      return {
        ...v,
        token_number: token,
      };
    });
    return sanitized.sort((a, b) => a.token_number - b.token_number);
  },

  setVisits(visits: Visit[]) {
    visits.sort((a, b) => a.token_number - b.token_number);
    setStorage('visits', visits);
  },

  getVisitsForDoctor(doctorId: string): Visit[] {
    return this.getVisits()
      .filter((v) => v.doctor_id === doctorId)
      .sort((a, b) => a.token_number - b.token_number);
  },

  saveVisit(visit: Visit) {
    const visits = this.getVisits();
    const idx = visits.findIndex((v) => v.id === visit.id);

    // Enforce unique token number: no other visit can have this token
    const isDuplicate = visits.some((v) => v.id !== visit.id && v.token_number === visit.token_number);
    if (isDuplicate || !visit.token_number) {
      const maxToken = visits.reduce((max, v) => (v.token_number > max ? v.token_number : max), 0);
      visit.token_number = maxToken + 1;
    }

    if (idx >= 0) {
      visits[idx] = visit;
    } else {
      visits.push(visit);
    }
    // Always persist sorted in ascending token order
    visits.sort((a, b) => a.token_number - b.token_number);
    setStorage('visits', visits);
    if (this._onSaveVisit) this._onSaveVisit(visit);
  },

  deleteVisit(visitId: string) {
    const visits = this.getVisits().filter((v) => v.id !== visitId);
    setStorage('visits', visits);
    // Also remove associated prescription if any
    const rx = this.getPrescriptions().filter((p) => p.visit_id !== visitId);
    setStorage('prescriptions', rx);
    if (this._onDeleteVisit) this._onDeleteVisit(visitId);
  },

  updateVisitStatus(visitId: string, status: VisitStatus) {
    const visits = this.getVisits();
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return;
    visit.status = status;
    visit.updated_at = new Date().toISOString();
    this.saveVisit(visit);
  },

  quickDeliverVisit(visitId: string, pharmacistName?: string) {
    const visits = this.getVisits();
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return;

    const rx = this.getPrescriptions().find((p) => p.visit_id === visitId);
    const patient = this.getPatientById(visit.patient_id);
    const drugs = this.getDrugs();

    if (rx && rx.items && rx.items.length > 0) {
      this.deliverPrescription({
        visitId: visit.id,
        prescriptionId: rx.id,
        pharmacistId: 'pharm-1',
        pharmacistName: pharmacistName || 'Pharmacist on Duty',
        patientId: patient?.id,
        patientName: patient?.name,
        patientPhone: patient?.phone,
        patientUhid: patient?.uhid,
        items: rx.items.map((i) => {
          const drug = drugs.find((d) => d.id === i.drug_id);
          const price = drug?.selling_price || 5;
          return {
            drugId: i.drug_id,
            drugName: i.drug_name,
            quantity: i.quantity || 10,
            unitPrice: price,
            totalPrice: Number(((i.quantity || 10) * price).toFixed(2)),
          };
        }),
        totalAmount: 75.0,
      });
    } else {
      visit.status = 'dispensed';
      visit.updated_at = new Date().toISOString();
      this.saveVisit(visit);
    }
  },

  getNextDailyToken(): number {
    const visits = this.getVisits();
    if (visits.length === 0) return 1;
    const maxToken = visits.reduce((max, v) => (Number(v.token_number) > max ? Number(v.token_number) : max), 0);
    return Math.max(maxToken, 0) + 1;
  },

  registerPatientAndVisit(data: {
    name: string;
    age: number;
    phone: string;
    blood_group?: string;
    has_bp: boolean;
    has_sugar: boolean;
    other_conditions?: string;
    doctorId: string;
  }): { patient: Patient; visit: Visit } {
    const patients = this.getPatients();
    // Check if patient exists by phone
    let patient = patients.find((p) => p.phone === data.phone);
    if (!patient) {
      const nextUhidNum = patients.length + 1;
      const uhid = `H-${String(nextUhidNum).padStart(4, '0')}`;
      patient = {
        id: generateUUID(),
        uhid,
        name: data.name,
        age: data.age,
        phone: data.phone,
        blood_group: data.blood_group,
        has_bp: data.has_bp,
        has_sugar: data.has_sugar,
        other_conditions: data.other_conditions,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.savePatient(patient);
    }

    const token = this.getNextDailyToken();
    const visitId = generateUUID();
    const todayFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const visitNumber = `V-${todayFormatted}-${String(token).padStart(3, '0')}`;

    const visit: Visit = {
      id: visitId,
      visit_number: visitNumber,
      patient_id: patient.id,
      doctor_id: data.doctorId,
      token_number: token,
      status: 'waiting',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.saveVisit(visit);

    return { patient, visit };
  },

  // ── Prescriptions ──
  getPrescriptions(): Prescription[] {
    return getStorage<Prescription[]>('prescriptions', DEFAULT_PRESCRIPTIONS);
  },

  setPrescriptions(prescriptions: Prescription[]) {
    setStorage('prescriptions', prescriptions);
  },

  getPrescriptionByVisitId(visitId: string): Prescription | undefined {
    return this.getPrescriptions().find((p) => p.visit_id === visitId);
  },

  savePrescription(rx: Prescription) {
    const rxList = this.getPrescriptions();
    const idx = rxList.findIndex((p) => p.id === rx.id);
    if (idx >= 0) {
      rxList[idx] = rx;
    } else {
      rxList.push(rx);
    }
    setStorage('prescriptions', rxList);
    if (this._onSavePrescription) this._onSavePrescription(rx);

    // Update visit status to 'prescribed' so it enters Pharmacy queue
    const visit = this.getVisits().find((v) => v.id === rx.visit_id);
    if (visit) {
      visit.status = 'prescribed';
      visit.updated_at = new Date().toISOString();
      this.saveVisit(visit);
    }
  },

  deletePrescription(rxId: string) {
    const rxList = this.getPrescriptions().filter((p) => p.id !== rxId);
    setStorage('prescriptions', rxList);
    if (this._onDeletePrescription) this._onDeletePrescription(rxId);
  },

  // ── Drugs & Pharmacy Inventory ──
  getDrugs(): Drug[] {
    return getStorage<Drug[]>('drugs', DEFAULT_DRUGS);
  },

  setDrugs(drugs: Drug[]) {
    setStorage('drugs', drugs);
  },

  saveDrug(drug: Drug) {
    const drugs = this.getDrugs();
    const idx = drugs.findIndex((d) => d.id === drug.id);
    if (idx >= 0) {
      drugs[idx] = drug;
    } else {
      drugs.unshift(drug);
    }
    setStorage('drugs', drugs);
    if (this._onSaveDrug) this._onSaveDrug(drug);
  },

  deleteDrug(drugId: string) {
    const drugs = this.getDrugs().filter((d) => d.id !== drugId);
    setStorage('drugs', drugs);
    if (this._onDeleteDrug) this._onDeleteDrug(drugId);
  },

  reduceStock(drugId: string, qty: number): boolean {
    const drugs = this.getDrugs();
    const drug = drugs.find((d) => d.id === drugId);
    if (!drug) return false;
    drug.stock_quantity = Math.max(0, drug.stock_quantity - qty);
    drug.updated_at = new Date().toISOString();
    setStorage('drugs', drugs);
    return true;
  },

  // ── Smart Dispensing Quantity Rules (PRD v1.1 Section 3.5) ──
  calculateSmartQuantity(
    drugType: string,
    morning: boolean,
    afternoon: boolean,
    night: boolean,
    numDays: number,
    doctorEnteredQty?: number
  ): number {
    const type = drugType?.toLowerCase() || 'tablet';
    if (type === 'syrup') {
      // PRD v1.1: Syrup is counted as a bottle, and dispensed as one bottle by default regardless of doses per day or number of days.
      return 1;
    }
    if (type === 'tablet' || type === 'capsule') {
      // PRD v1.1: suggested quantity = doses per day x number of days from the prescription.
      const dosesPerDay = (morning ? 1 : 0) + (afternoon ? 1 : 0) + (night ? 1 : 0);
      return Math.max(1, (dosesPerDay || 1) * (numDays || 1));
    }
    // Injections and other items: quantity follows what the doctor wrote (e.g. vials/doses)
    return doctorEnteredQty && doctorEnteredQty > 0 ? doctorEnteredQty : 1;
  },

  // ── Dispensing (PRD v1.1 Delivered Flow) ──
  getDispensings(): Dispensing[] {
    return getStorage<Dispensing[]>('dispensings', []);
  },

  setDispensings(dispensings: Dispensing[]) {
    setStorage('dispensings', dispensings);
  },

  dispensePrescription(data: {
    visitId?: string;
    prescriptionId?: string;
    pharmacistId: string;
    pharmacistName?: string;
    patientId?: string;
    patientName?: string;
    patientPhone?: string;
    patientUhid?: string;
    uaid?: string;
    stayDayNumber?: number;
    items: {
      drugId: string;
      drugName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      isCustom?: boolean;
    }[];
    totalAmount: number;
    overrideReason?: string;
    hasScheduleHWarning?: boolean;
  }) {
    return this.deliverPrescription(data);
  },

  deliverPrescription(data: {
    visitId?: string;
    prescriptionId?: string;
    pharmacistId: string;
    pharmacistName?: string;
    patientId?: string;
    patientName?: string;
    patientPhone?: string;
    patientUhid?: string;
    uaid?: string;
    stayDayNumber?: number;
    items: {
      drugId: string;
      drugName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      isCustom?: boolean;
    }[];
    totalAmount: number;
    overrideReason?: string;
    hasScheduleHWarning?: boolean;
  }) {
    // 1. Reduce inventory stock for all actual catalog items
    for (const item of data.items) {
      if (!item.isCustom && item.drugId) {
        this.reduceStock(item.drugId, item.quantity);
      }
    }

    // 2. Mark OPD visit as dispensed
    if (data.visitId) {
      const visit = this.getVisits().find((v) => v.id === data.visitId);
      if (visit) {
        visit.status = 'dispensed';
        visit.updated_at = new Date().toISOString();
        this.saveVisit(visit);
      }
    }

    // 2b. Sync/Update Prescription so any tablet added or modified by pharmacist appears on doctor's prescription!
    const allPrescriptions = this.getPrescriptions();
    const targetRx = allPrescriptions.find(
      (p) => p.id === data.prescriptionId || (data.visitId && p.visit_id === data.visitId)
    );
    if (targetRx) {
      const rxItemsMap = new Map((targetRx.items || []).map((it) => [it.drug_id || it.drug_name, it]));
      const updatedRxItems: PrescriptionItem[] = data.items.map((it, idx) => {
        const existing = rxItemsMap.get(it.drugId) || rxItemsMap.get(it.drugName);
        if (existing) {
          return {
            ...existing,
            quantity: it.quantity,
          };
        }
        return {
          id: generateUUID(),
          prescription_id: targetRx!.id,
          drug_id: it.drugId,
          drug_name: it.drugName,
          item_type: 'tablet',
          dose_morning: true,
          dose_afternoon: false,
          dose_night: true,
          dose_relation: 'after_food',
          num_days: Math.ceil(it.quantity / 2) || 5,
          quantity: it.quantity,
          is_custom: it.isCustom,
          added_by_pharmacist: true,
          pharmacist_notes: 'Added by Pharmacist during dispensing',
          created_at: new Date().toISOString(),
        };
      });
      targetRx.items = updatedRxItems;
      this.savePrescription(targetRx);
    }

    // 3. If IP admission, accrue charges
    if (data.uaid) {
      const admissions = this.getAdmissions();
      const adm = admissions.find((a) => a.uaid === data.uaid || a.id === data.uaid);
      if (adm) {
        adm.total_pharmacy_charges = (adm.total_pharmacy_charges || 0) + data.totalAmount;
        this.saveAdmission(adm);
      }
    }

    // 4. Record dispensing history (Delivered confirmation with timestamp and pharmacist name)
    const dispensings = this.getDispensings();
    const dispId = generateUUID();
    const newDispensing: Dispensing = {
      id: dispId,
      prescription_id: data.prescriptionId,
      patient_id: data.patientId,
      pharmacist_id: data.pharmacistId,
      pharmacist_name: data.pharmacistName || 'Pharmacist on Duty',
      patient_name: data.patientName,
      patient_phone: data.patientPhone,
      patient_uhid: data.patientUhid,
      is_walk_in: false,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      override_reason: data.overrideReason,
      has_schedule_h_warning: data.hasScheduleHWarning,
      uaid: data.uaid,
      stay_day_number: data.stayDayNumber,
      total_amount: data.totalAmount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: data.items.map((i) => ({
        id: generateUUID(),
        dispensing_id: dispId,
        drug_id: i.drugId,
        drug_name: i.drugName,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        total_price: i.totalPrice,
        is_custom: i.isCustom,
        created_at: new Date().toISOString(),
      })),
    };
    dispensings.unshift(newDispensing);
    setStorage('dispensings', dispensings);
    if (this._onSaveDispensing) this._onSaveDispensing(newDispensing);
    return newDispensing;
  },

  // ── Walk-in Sale (No Prescription Flow - PRD v1.1 Section 3.5) ──
  recordWalkInSale(data: {
    pharmacistId: string;
    pharmacistName?: string;
    patientName?: string;
    patientPhone?: string;
    patientUhid?: string;
    items: {
      drugId: string;
      drugName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }[];
    totalAmount: number;
    hasScheduleHWarning?: boolean;
    overrideReason?: string;
  }): Dispensing {
    // 1. Reduce stock
    for (const item of data.items) {
      if (item.drugId) {
        this.reduceStock(item.drugId, item.quantity);
      }
    }

    // 2. Save dispensing record clearly tagged "is_walk_in: true"
    const dispensings = this.getDispensings();
    const walkInDispId = generateUUID();
    const newDispensing: Dispensing = {
      id: walkInDispId,
      pharmacist_id: data.pharmacistId,
      pharmacist_name: data.pharmacistName || 'Pharmacist on Duty',
      patient_name: data.patientName?.trim() || 'Walk-in Customer (No Rx)',
      patient_phone: data.patientPhone?.trim() || undefined,
      patient_uhid: data.patientUhid?.trim() || undefined,
      is_walk_in: true,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      has_schedule_h_warning: data.hasScheduleHWarning,
      override_reason: data.overrideReason,
      total_amount: data.totalAmount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: data.items.map((i) => ({
        id: generateUUID(),
        dispensing_id: walkInDispId,
        drug_id: i.drugId,
        drug_name: i.drugName,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        total_price: i.totalPrice,
        created_at: new Date().toISOString(),
      })),
    };
    dispensings.unshift(newDispensing);
    setStorage('dispensings', dispensings);
    if (this._onSaveDispensing) this._onSaveDispensing(newDispensing);
    return newDispensing;
  },

  // ── Edit Dispensed Items (PRD v1.1: stock corrects itself) ──
  editDispensedItem(dispensingId: string, itemId: string, newQuantity: number) {
    const dispensings = this.getDispensings();
    const disp = dispensings.find((d) => d.id === dispensingId);
    if (!disp || !disp.items) return;

    const item = disp.items.find((i) => i.id === itemId);
    if (!item) return;

    const oldQty = item.quantity;
    const diff = newQuantity - oldQty;

    // Correct inventory stock
    if (diff > 0) {
      // Dispensed more -> reduce stock further
      this.reduceStock(item.drug_id, diff);
    } else if (diff < 0) {
      // Dispensed less -> return surplus to inventory
      const drugs = this.getDrugs();
      const drug = drugs.find((d) => d.id === item.drug_id);
      if (drug) {
        drug.stock_quantity += Math.abs(diff);
        drug.updated_at = new Date().toISOString();
        setStorage('drugs', drugs);
      }
    }

    item.quantity = newQuantity;
    item.total_price = Number((newQuantity * item.unit_price).toFixed(2));
    disp.total_amount = disp.items.reduce((s, it) => s + it.total_price, 0);
    disp.updated_at = new Date().toISOString();
    setStorage('dispensings', dispensings);
  },

  removeDispensedItem(dispensingId: string, itemId: string) {
    const dispensings = this.getDispensings();
    const disp = dispensings.find((d) => d.id === dispensingId);
    if (!disp || !disp.items) return;

    const item = disp.items.find((i) => i.id === itemId);
    if (!item) return;

    // Return stock completely to inventory
    const drugs = this.getDrugs();
    const drug = drugs.find((d) => d.id === item.drug_id);
    if (drug) {
      drug.stock_quantity += item.quantity;
      drug.updated_at = new Date().toISOString();
      setStorage('drugs', drugs);
    }

    disp.items = disp.items.filter((i) => i.id !== itemId);
    disp.total_amount = disp.items.reduce((s, it) => s + it.total_price, 0);
    disp.updated_at = new Date().toISOString();
    setStorage('dispensings', dispensings);
  },

  // ── Hospital Print Queue (PRD v1.1 Section 3.4 Path 2) ──
  getPrintQueue(): {
    id: string;
    rxId: string;
    patientName: string;
    token: string;
    doctorName: string;
    printerName: string;
    createdAt: string;
    status: 'queued' | 'printed';
  }[] {
    return getStorage('print_queue', []);
  },

  sendToPrintQueue(job: {
    rxId: string;
    patientName: string;
    token: string;
    doctorName: string;
    printerName?: string;
  }) {
    const queue = this.getPrintQueue();
    const newJob = {
      id: `print-${Date.now()}`,
      rxId: job.rxId,
      patientName: job.patientName,
      token: job.token,
      doctorName: job.doctorName,
      printerName: job.printerName || this.getSettings().default_printer || 'Hospital Reception LaserJet',
      createdAt: new Date().toISOString(),
      status: 'printed' as const,
    };
    queue.unshift(newJob);
    setStorage('print_queue', queue);
    return newJob;
  },

  // ── In-Patient (IP) ──
  getWards(): Ward[] {
    return getStorage<Ward[]>('wards', DEFAULT_WARDS);
  },

  getBeds(): Bed[] {
    return getStorage<Bed[]>('beds', DEFAULT_BEDS);
  },

  getAdmissions(): Admission[] {
    return getStorage<Admission[]>('admissions', DEFAULT_ADMISSIONS);
  },

  setAdmissions(admissions: Admission[]) {
    setStorage('admissions', admissions);
  },

  saveAdmission(adm: Admission) {
    const list = this.getAdmissions();
    const idx = list.findIndex((a) => a.id === adm.id);
    if (idx >= 0) {
      list[idx] = adm;
    } else {
      list.unshift(adm);
    }
    setStorage('admissions', list);

    // mark bed occupied
    const beds = this.getBeds();
    const bed = beds.find((b) => b.id === adm.bed_id);
    if (bed) {
      bed.is_occupied = adm.status === 'admitted';
      setStorage('beds', beds);
    }
    if (this._onSaveAdmission) this._onSaveAdmission(adm);
  },

  // ── Settings ──
  getSettings(): HospitalSettings {
    return getStorage<HospitalSettings>('settings', DEFAULT_SETTINGS);
  },

  saveSettings(settings: HospitalSettings) {
    setStorage('settings', settings);
    if (this._onSaveSettings) this._onSaveSettings(settings);
  },

  // ── Reset to Clean Production State ──
  resetAllData() {
    setStorage('users', []);
    setStorage('patients', []);
    setStorage('visits', []);
    setStorage('prescriptions', []);
    setStorage('drugs', DEFAULT_DRUGS);
    setStorage('wards', DEFAULT_WARDS);
    setStorage('beds', DEFAULT_BEDS.map((b) => ({ ...b, is_occupied: false })));
    setStorage('admissions', []);
    setStorage('settings', DEFAULT_SETTINGS);
    setStorage('dispensings', []);
    this.setCurrentUser(null);
    if (this._onPurgeAll) this._onPurgeAll();
  },
};

