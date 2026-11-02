/* ──────────────────────────────────────────────────────────────
   Database types for the Hospital Management System
   These mirror the Supabase/Postgres schema.
   ────────────────────────────────────────────────────────────── */

// ── Enums ──

export type UserRole = 'admin' | 'receptionist' | 'doctor' | 'pharmacist';

export type VisitStatus =
  | 'waiting'       // in doctor queue
  | 'in_consultation'
  | 'prescribed'    // moved to pharmacy queue
  | 'dispensed'     // pharmacy done
  | 'completed';

export type DrugType = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'other';

export type DoseTime = 'morning' | 'afternoon' | 'night';
export type DoseRelation = 'before_food' | 'after_food';

export type IPStatus = 'admitted' | 'discharged';

// ── Core tables ──

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  is_active: boolean;
  created_at: string;
}

export interface Doctor {
  id: string;
  user_id: string;
  specialization?: string;
  consultation_room?: string;
  is_available: boolean;
  created_at: string;
  // joined
  user?: User;
}

export interface Patient {
  id: string;
  uhid: string;             // Unique Hospital ID — permanent
  name: string;
  age: number;
  phone: string;
  blood_group?: string;
  has_bp: boolean;
  has_sugar: boolean;
  other_conditions?: string;
  created_at: string;
  updated_at: string;
}

export interface Visit {
  id: string;
  visit_number: string;     // Visit ID
  patient_id: string;
  doctor_id: string;
  token_number: number;
  status: VisitStatus;
  follow_up_date?: string;
  instructions?: string;
  created_at: string;
  updated_at: string;
  // joined
  patient?: Patient;
  doctor?: Doctor;
}

// ── Prescription ──

export interface Prescription {
  id: string;
  visit_id: string;
  doctor_id: string;
  patient_id: string;
  notes?: string;
  uaid?: string;            // IP Unique Admission ID if IP prescription
  stay_day_number?: number; // IP Stay Day e.g. Day 2
  created_at: string;
  // joined
  items?: PrescriptionItem[];
  lab_tests?: LabTestOrder[];
  visit?: Visit;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  drug_id: string;
  drug_name: string;        // snapshot at prescription time
  dose_morning: boolean;
  dose_afternoon: boolean;
  dose_night: boolean;
  dose_relation: DoseRelation;
  num_days: number;
  quantity?: number;
  is_custom?: boolean;       // free-text item not in pharmacy catalog (Other item)
  item_type?: DrugType;
  custom_unit?: string;
  added_by_pharmacist?: boolean;
  pharmacist_notes?: string;
  created_at: string;
  // joined
  drug?: Drug;
}

export interface LabTestOrder {
  id: string;
  prescription_id: string;
  test_name: string;
  notes?: string;
  created_at: string;
}

// ── Pharmacy ──

export interface Drug {
  id: string;
  name: string;
  drug_type: DrugType;
  custom_type_name?: string;
  expiry_date: string;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_limit: number;
  boxes?: number;
  tablets_per_sheet?: number;
  price_per_sheet?: number;
  selling_price_per_sheet?: number;
  price_per_unit?: number;
  batch_number?: string;
  supplier?: string;
  unit?: string;
  schedule_h: boolean;
  schedule_h1: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Dispensing {
  id: string;
  prescription_id?: string;  // null for walk-in sales
  patient_id?: string;
  pharmacist_id: string;
  pharmacist_name?: string;
  patient_name?: string;
  patient_phone?: string;
  patient_uhid?: string;
  is_walk_in: boolean;
  total_amount: number;
  has_schedule_h_warning?: boolean;
  override_reason?: string;
  status?: 'delivered';
  delivered_at?: string;
  uaid?: string;             // if IP prescription
  stay_day_number?: number;
  created_at: string;
  updated_at: string;
  // joined
  items?: DispensingItem[];
}

export interface DispensingItem {
  id: string;
  dispensing_id: string;
  drug_id: string;
  drug_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_custom?: boolean;
  created_at: string;
}

// ── IP (In-Patient) — v1.1 ──

export interface Ward {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Bed {
  id: string;
  ward_id: string;
  bed_number: string;
  price_per_day: number;
  is_occupied: boolean;
  created_at: string;
  // joined
  ward?: Ward;
}

export interface Admission {
  id: string;
  uaid: string;              // Unique Admission ID
  patient_id: string;
  bed_id: string;
  doctor_id: string;
  diagnosis?: string;
  has_bp: boolean;
  has_sugar: boolean;
  other_conditions?: string;
  status: IPStatus;
  admitted_at: string;
  discharged_at?: string;
  hours_per_day: number;     // billing day length, default 18
  total_bed_charges: number;
  total_pharmacy_charges: number;
  total_lab_charges: number;
  // joined
  patient?: Patient;
  bed?: Bed;
  doctor?: Doctor;
}

// ── Audit ──

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  table_name: string;
  record_id: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  created_at: string;
}

// ── Settings ──

export interface HospitalSettings {
  id: string;
  hospital_name: string;
  hospital_logo_url?: string;
  address?: string;
  phone?: string;
  token_reset_hour: number;     // hour of day to reset tokens (0-23)
  ip_hours_per_day: number;     // default billing day length
  prescription_paper_size: 'A4' | 'A5';
  prescription_header?: string;
  prescription_footer?: string;
  default_printer?: string;
  schedule_h_action?: 'warn' | 'block';
  whatsapp_enabled?: boolean;
  whatsapp_template?: string;
  low_stock_days_warning: number;
  expiry_days_warning: number[];  // e.g. [90, 60, 30]
  updated_at: string;
}

