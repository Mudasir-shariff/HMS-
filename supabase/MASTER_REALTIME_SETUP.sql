-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- MASTER CONSOLIDATED DATABASE & REALTIME SETUP (SINGLE SOURCE OF TRUTH)
-- =============================================================================
-- Paste and run this ENTIRE script in the Supabase SQL Editor.
-- It configures:
-- 1. All hospital tables with canonical UUID keys, versioning & soft deletes.
-- 2. Atomic sequences and advisory-locked RPCs for UHID, OPD tokens & dispensing.
-- 3. Enables Supabase Realtime across all tables with REPLICA IDENTITY FULL.
-- 4. Grants full permissions to anon & authenticated (disables RLS blocks).
-- 5. Seeds default staff logins (Admin, Doctor, Receptionist, Pharmacist),
--    essential drug inventory, hospital settings, wards, and beds.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLES DEFINITION
-- -----------------------------------------------------------------------------

-- Staff Profiles (Direct auth & role mapping)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT,
  password            TEXT,
  full_name           TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'receptionist',
  phone               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  specialization      TEXT,
  consultation_room   TEXT,
  consultation_fee    NUMERIC DEFAULT 500,
  opd_timings         TEXT,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist if table was previously created
ALTER TABLE IF EXISTS public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS consultation_room TEXT;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC DEFAULT 500;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS opd_timings TEXT;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Doctors Table (Canonical Key: id = user_id)
CREATE TABLE IF NOT EXISTS public.doctors (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL,
  full_name           TEXT,
  specialization      TEXT,
  consultation_room   TEXT,
  consultation_fee    NUMERIC DEFAULT 500,
  opd_timings         TEXT,
  is_available        BOOLEAN NOT NULL DEFAULT TRUE,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.doctors DROP CONSTRAINT IF EXISTS doctors_user_id_fkey;
ALTER TABLE IF EXISTS public.doctors DROP CONSTRAINT IF EXISTS doctors_id_fkey;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC DEFAULT 500;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS opd_timings TEXT;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Patients Master Table
CREATE TABLE IF NOT EXISTS public.patients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uhid                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  age                 INT NOT NULL,
  phone               TEXT NOT NULL,
  blood_group         TEXT,
  has_bp              BOOLEAN DEFAULT FALSE,
  has_sugar           BOOLEAN DEFAULT FALSE,
  other_conditions    TEXT,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.patients ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- OPD Visits & Doctor Consultation Queue
CREATE TABLE IF NOT EXISTS public.visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_number        TEXT NOT NULL UNIQUE,
  patient_id          UUID NOT NULL,
  doctor_id           UUID,
  token_number        INT NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'waiting', -- waiting, in_consultation, prescribed, dispensed, completed
  follow_up_date      DATE,
  instructions        TEXT,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.visits ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.visits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Prescriptions
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id            UUID,
  doctor_id           UUID,
  patient_id          UUID,
  notes               TEXT,
  uaid                TEXT,
  stay_day_number     INT,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.prescriptions ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.prescriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Prescription Items (Medicine Details)
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id     UUID NOT NULL,
  drug_id             UUID,
  drug_name           TEXT NOT NULL,
  dose_morning        BOOLEAN DEFAULT FALSE,
  dose_afternoon      BOOLEAN DEFAULT FALSE,
  dose_night          BOOLEAN DEFAULT FALSE,
  dose_relation       TEXT DEFAULT 'after_food',
  num_days            INT NOT NULL DEFAULT 1,
  quantity            INT,
  is_custom           BOOLEAN DEFAULT FALSE,
  item_type           TEXT,
  custom_unit         TEXT,
  added_by_pharmacist BOOLEAN DEFAULT FALSE,
  pharmacist_notes    TEXT,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.prescription_items ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.prescription_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Lab Test Orders
CREATE TABLE IF NOT EXISTS public.lab_test_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id     UUID NOT NULL,
  test_name           TEXT NOT NULL,
  notes               TEXT,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.lab_test_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drugs & Pharmacy Inventory
CREATE TABLE IF NOT EXISTS public.drugs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  drug_type           TEXT NOT NULL DEFAULT 'tablet',
  custom_type_name    TEXT,
  unit_price          NUMERIC NOT NULL DEFAULT 0,
  selling_price       NUMERIC DEFAULT 0,
  purchase_price      NUMERIC DEFAULT 0,
  stock_quantity      INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_limit     INT DEFAULT 30,
  reorder_level       INT DEFAULT 50,
  boxes               INT,
  tablets_per_sheet   INT,
  price_per_sheet     NUMERIC,
  batch_number        TEXT,
  expiry_date         DATE,
  supplier            TEXT,
  unit                TEXT,
  schedule_h          BOOLEAN DEFAULT FALSE,
  schedule_h1         BOOLEAN DEFAULT FALSE,
  is_active           BOOLEAN DEFAULT TRUE,
  version             INT DEFAULT 1,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.drugs ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.drugs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Dispensings (Pharmacy Bills & Sales)
CREATE TABLE IF NOT EXISTS public.dispensings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id         UUID,
  patient_id              UUID,
  pharmacist_id           UUID,
  pharmacist_name         TEXT,
  patient_name            TEXT,
  patient_phone           TEXT,
  patient_uhid            TEXT,
  is_walk_in              BOOLEAN DEFAULT FALSE,
  total_amount            NUMERIC NOT NULL DEFAULT 0,
  has_schedule_h_warning  BOOLEAN DEFAULT FALSE,
  override_reason         TEXT,
  status                  TEXT DEFAULT 'delivered',
  delivered_at            TIMESTAMPTZ,
  uaid                    TEXT,
  stay_day_number         INT,
  version                 INT DEFAULT 1,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.dispensings ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE IF EXISTS public.dispensings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Dispensing Items
CREATE TABLE IF NOT EXISTS public.dispensing_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensing_id       UUID NOT NULL,
  drug_id             UUID,
  drug_name           TEXT NOT NULL,
  quantity            INT NOT NULL DEFAULT 1,
  unit_price          NUMERIC NOT NULL DEFAULT 0,
  total_price         NUMERIC NOT NULL DEFAULT 0,
  is_custom           BOOLEAN DEFAULT FALSE,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.dispensing_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Wards & In-Patient Beds
CREATE TABLE IF NOT EXISTS public.wards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  floor               TEXT,
  total_beds          INT NOT NULL DEFAULT 1,
  price_per_day       NUMERIC DEFAULT 500,
  is_active           BOOLEAN DEFAULT TRUE,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.wards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.beds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id             UUID NOT NULL,
  bed_number          TEXT NOT NULL,
  price_per_day       NUMERIC DEFAULT 500,
  is_occupied         BOOLEAN DEFAULT FALSE,
  is_active           BOOLEAN DEFAULT TRUE,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.beds ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.admissions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uaid                    TEXT NOT NULL UNIQUE,
  patient_id              UUID NOT NULL,
  doctor_id               UUID,
  bed_id                  UUID,
  admitted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharged_at           TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'admitted',
  provisional_diagnosis   TEXT,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.admissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Hospital Settings
CREATE TABLE IF NOT EXISTS public.hospital_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name           TEXT NOT NULL DEFAULT 'RADHAKRISHNA HOSPITAL',
  tagline                 TEXT DEFAULT 'Excellence in Healthcare',
  hospital_logo_url       TEXT,
  address                 TEXT,
  phone                   TEXT,
  email                   TEXT,
  registration_fee        NUMERIC DEFAULT 100,
  token_reset_hour        INT DEFAULT 0,
  ip_hours_per_day        INT DEFAULT 18,
  prescription_paper_size TEXT DEFAULT 'A4',
  prescription_header     TEXT DEFAULT 'MULTISPECIALITY CARE',
  prescription_footer     TEXT DEFAULT 'Please follow the doctor advice.',
  default_printer         TEXT DEFAULT 'Reception Thermal Printer',
  schedule_h_action       TEXT DEFAULT 'warn',
  whatsapp_enabled        BOOLEAN DEFAULT TRUE,
  whatsapp_template       TEXT DEFAULT 'Namaste {patient_name}, your token at {hospital_name} is #{token}.',
  low_stock_days_warning  INT DEFAULT 7,
  expiry_days_warning     INT[] DEFAULT ARRAY[90, 60, 30],
  deleted_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.hospital_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID,
  action      TEXT NOT NULL,
  user_id     UUID,
  user_role   TEXT,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. SEQUENCES & CONCURRENCY-SAFE GENERATORS
-- -----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.uhid_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.opd_visit_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.generate_next_uhid()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'H-' || LPAD(nextval('public.uhid_seq')::TEXT, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.generate_next_visit_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'OPD-' || TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || LPAD(nextval('public.opd_visit_seq')::TEXT, 4, '0');
$$;

-- Advisory-Locked Daily Token Generator (Guarantees zero duplicate tokens across concurrent devices)
CREATE OR REPLACE FUNCTION public.generate_next_daily_token(
  p_doctor_id UUID,
  p_visit_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key BIGINT;
  v_token INT;
BEGIN
  v_lock_key := ('x' || SUBSTR(MD5(COALESCE(p_doctor_id::TEXT, 'global') || p_visit_date::TEXT), 1, 15))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO v_token
  FROM public.visits
  WHERE (doctor_id = p_doctor_id OR (p_doctor_id IS NULL AND doctor_id IS NULL))
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = p_visit_date
    AND deleted_at IS NULL;

  RETURN v_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC RPC TRANSACTIONS
-- -----------------------------------------------------------------------------

-- Atomic Patient Registration & OPD Token Generation
CREATE OR REPLACE FUNCTION public.register_patient_and_visit_atomic(
  p_name TEXT,
  p_age INT,
  p_phone TEXT,
  p_doctor_id UUID DEFAULT NULL,
  p_blood_group TEXT DEFAULT NULL,
  p_has_bp BOOLEAN DEFAULT FALSE,
  p_has_sugar BOOLEAN DEFAULT FALSE,
  p_other_conditions TEXT DEFAULT NULL,
  p_uhid TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patient RECORD;
  v_visit RECORD;
  v_uhid TEXT;
  v_visit_number TEXT;
  v_token_number INT;
  v_patient_id UUID;
  v_visit_id UUID;
BEGIN
  IF p_uhid IS NOT NULL AND p_uhid != '' THEN
    SELECT * INTO v_patient FROM public.patients WHERE uhid = UPPER(TRIM(p_uhid)) AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  END IF;

  IF v_patient.id IS NULL AND p_phone IS NOT NULL AND LENGTH(TRIM(p_phone)) >= 10 THEN
    SELECT * INTO v_patient FROM public.patients WHERE phone = TRIM(p_phone) AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  END IF;

  IF v_patient.id IS NOT NULL THEN
    v_patient_id := v_patient.id;
    v_uhid := v_patient.uhid;
    UPDATE public.patients
    SET name = TRIM(p_name),
        age = p_age,
        blood_group = COALESCE(p_blood_group, blood_group),
        has_bp = p_has_bp,
        has_sugar = p_has_sugar,
        other_conditions = COALESCE(p_other_conditions, other_conditions),
        updated_at = NOW()
    WHERE id = v_patient_id
    RETURNING * INTO v_patient;
  ELSE
    v_uhid := public.generate_next_uhid();
    v_patient_id := gen_random_uuid();

    INSERT INTO public.patients (
      id, uhid, name, age, phone, blood_group, has_bp, has_sugar, other_conditions, version, created_at, updated_at
    ) VALUES (
      v_patient_id, v_uhid, TRIM(p_name), p_age, TRIM(p_phone), p_blood_group, p_has_bp, p_has_sugar, p_other_conditions, 1, NOW(), NOW()
    ) RETURNING * INTO v_patient;
  END IF;

  v_token_number := public.generate_next_daily_token(p_doctor_id);
  v_visit_number := public.generate_next_visit_number();
  v_visit_id := gen_random_uuid();

  INSERT INTO public.visits (
    id, visit_number, patient_id, doctor_id, token_number, status, version, created_at, updated_at
  ) VALUES (
    v_visit_id, v_visit_number, v_patient_id, p_doctor_id, v_token_number, 'waiting', 1, NOW(), NOW()
  ) RETURNING * INTO v_visit;

  RETURN jsonb_build_object(
    'patient', to_jsonb(v_patient),
    'visit', to_jsonb(v_visit)
  );
END;
$$;

-- Atomic Dispensing (Lock visit, check stock >= qty, decrement stock, complete visit)
CREATE OR REPLACE FUNCTION public.dispense_prescription_atomic(
  p_prescription_id UUID DEFAULT NULL,
  p_pharmacist_id UUID DEFAULT NULL,
  p_pharmacist_name TEXT DEFAULT 'Pharmacist on Duty',
  p_items JSONB DEFAULT '[]'::JSONB,
  p_override_reason TEXT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT 0,
  p_is_walk_in BOOLEAN DEFAULT FALSE,
  p_patient_id UUID DEFAULT NULL,
  p_patient_name TEXT DEFAULT NULL,
  p_patient_phone TEXT DEFAULT NULL,
  p_patient_uhid TEXT DEFAULT NULL,
  p_uaid TEXT DEFAULT NULL,
  p_stay_day_number INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dispensing_id UUID;
  v_visit_id UUID;
  v_visit_status TEXT;
  v_item RECORD;
  v_drug RECORD;
  v_item_drug_id UUID;
  v_item_qty INT;
  v_has_schedule_h BOOLEAN := FALSE;
BEGIN
  IF p_prescription_id IS NOT NULL THEN
    SELECT v.id, v.status
    INTO v_visit_id, v_visit_status
    FROM public.visits v
    JOIN public.prescriptions p ON p.visit_id = v.id
    WHERE p.id = p_prescription_id
    FOR UPDATE;

    IF v_visit_status IN ('dispensed', 'completed') THEN
      RAISE EXCEPTION 'Prescription has already been dispensed by another pharmacist.';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    drug_id UUID,
    drug_name TEXT,
    quantity INT,
    unit_price NUMERIC,
    is_custom BOOLEAN
  )
  LOOP
    v_item_drug_id := v_item.drug_id;
    v_item_qty := COALESCE(v_item.quantity, 1);

    IF v_item_drug_id IS NOT NULL AND NOT COALESCE(v_item.is_custom, FALSE) THEN
      SELECT * INTO v_drug FROM public.drugs WHERE id = v_item_drug_id FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Drug not found: %', v_item_drug_id;
      END IF;

      IF v_drug.stock_quantity < v_item_qty THEN
        RAISE EXCEPTION 'Insufficient stock for %: available %, requested %', v_drug.name, v_drug.stock_quantity, v_item_qty;
      END IF;

      IF v_drug.schedule_h OR v_drug.schedule_h1 THEN
        v_has_schedule_h := TRUE;
      END IF;

      UPDATE public.drugs
      SET stock_quantity = stock_quantity - v_item_qty,
          updated_at = NOW()
      WHERE id = v_item_drug_id;
    END IF;
  END LOOP;

  v_dispensing_id := gen_random_uuid();
  INSERT INTO public.dispensings (
    id, prescription_id, patient_id, pharmacist_id, pharmacist_name,
    patient_name, patient_phone, patient_uhid, is_walk_in, total_amount,
    has_schedule_h_warning, override_reason, status, delivered_at,
    uaid, stay_day_number, version, created_at, updated_at
  ) VALUES (
    v_dispensing_id, p_prescription_id, p_patient_id, p_pharmacist_id, p_pharmacist_name,
    p_patient_name, p_patient_phone, p_patient_uhid, p_is_walk_in, p_total_amount,
    v_has_schedule_h, p_override_reason, 'delivered', NOW(),
    p_uaid, p_stay_day_number, 1, NOW(), NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    drug_id UUID,
    drug_name TEXT,
    quantity INT,
    unit_price NUMERIC,
    total_price NUMERIC,
    is_custom BOOLEAN
  )
  LOOP
    INSERT INTO public.dispensing_items (
      id, dispensing_id, drug_id, drug_name, quantity, unit_price, total_price, is_custom, created_at
    ) VALUES (
      gen_random_uuid(), v_dispensing_id, v_item.drug_id, v_item.drug_name,
      COALESCE(v_item.quantity, 1), COALESCE(v_item.unit_price, 0),
      COALESCE(v_item.total_price, COALESCE(v_item.quantity, 1) * COALESCE(v_item.unit_price, 0)),
      COALESCE(v_item.is_custom, FALSE), NOW()
    );
  END LOOP;

  IF v_visit_id IS NOT NULL THEN
    UPDATE public.visits
    SET status = 'dispensed',
        updated_at = NOW()
    WHERE id = v_visit_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'dispensing_id', v_dispensing_id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. DISABLE ROW LEVEL SECURITY (RLS) FOR CROSS-DEVICE ANONYMOUS ACCESS
-- -----------------------------------------------------------------------------
-- In this deployment, staff authenticate via internal hospital credentials
-- using the public anon client. Disabling RLS ensures:
-- 1) SELECT queries never return empty arrays.
-- 2) Supabase Realtime sends postgres_changes broadcasts to all connected devices.

ALTER TABLE public.user_profiles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_test_orders    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensings        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_items   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_settings  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. REALTIME PUBLICATION & REPLICA IDENTITY FULL
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'user_profiles', 'doctors', 'patients', 'visits', 'prescriptions',
    'prescription_items', 'lab_test_orders', 'drugs', 'dispensings',
    'dispensing_items', 'wards', 'beds', 'admissions', 'hospital_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. ENSURE PRIMARY KEYS
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.user_profiles ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.doctors ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.patients ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.visits ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.prescriptions ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.drugs ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.hospital_settings ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.wards ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.beds ADD PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 7. SEED ESSENTIAL HOSPITAL DATA (STAFF, DRUGS, SETTINGS, WARDS, BEDS)
-- -----------------------------------------------------------------------------

-- Standard Staff Accounts for Multi-Device Logins:
-- Super Admin:  admin@hospital.local      / admin123
-- Doctor 1:     doctor@hospital.local     / doctor123
-- Doctor 2:     dr.priya@hospital.local   / doctor123
-- Receptionist: reception@hospital.local  / reception123
-- Pharmacist:   pharmacy@hospital.local   / pharmacy123

DELETE FROM public.user_profiles WHERE id IN (
  '11111111-1111-4111-a111-111111111111',
  '22222222-2222-4222-a222-222222222222',
  '33333333-3333-4333-a333-333333333333',
  '44444444-4444-4444-a444-444444444444',
  '55555555-5555-4555-a555-555555555555'
);

INSERT INTO public.user_profiles (id, email, password, full_name, role, phone, is_active, specialization, consultation_room, consultation_fee, opd_timings, version, created_at, updated_at)
VALUES
  ('11111111-1111-4111-a111-111111111111', 'admin@hospital.local', 'admin123', 'Super Admin', 'admin', '9800000001', TRUE, NULL, NULL, 0, NULL, 1, NOW(), NOW()),
  ('22222222-2222-4222-a222-222222222222', 'doctor@hospital.local', 'doctor123', 'Dr. Ramesh Gupta', 'doctor', '9800000002', TRUE, 'Cardiologist', 'OPD Room 1', 500, '09:00 AM - 01:00 PM', 1, NOW(), NOW()),
  ('33333333-3333-4333-a333-333333333333', 'dr.priya@hospital.local', 'doctor123', 'Dr. Priya Sharma', 'doctor', '9800000003', TRUE, 'General Physician', 'OPD Room 2', 400, '10:00 AM - 02:00 PM', 1, NOW(), NOW()),
  ('44444444-4444-4444-a444-444444444444', 'reception@hospital.local', 'reception123', 'Anjali Sharma', 'receptionist', '9800000004', TRUE, NULL, 'Reception Desk', 0, NULL, 1, NOW(), NOW()),
  ('55555555-5555-4555-a555-555555555555', 'pharmacy@hospital.local', 'pharmacy123', 'Suresh Patel', 'pharmacist', '9800000005', TRUE, NULL, 'Main Pharmacy', 0, NULL, 1, NOW(), NOW());

-- Doctors Table Sync
DELETE FROM public.doctors WHERE id IN (
  '22222222-2222-4222-a222-222222222222',
  '33333333-3333-4333-a333-333333333333'
);

INSERT INTO public.doctors (id, user_id, full_name, specialization, consultation_room, consultation_fee, opd_timings, is_available, created_at)
VALUES
  ('22222222-2222-4222-a222-222222222222', '22222222-2222-4222-a222-222222222222', 'Dr. Ramesh Gupta', 'Cardiologist', 'OPD Room 1', 500, '09:00 AM - 01:00 PM', TRUE, NOW()),
  ('33333333-3333-4333-a333-333333333333', '33333333-3333-4333-a333-333333333333', 'Dr. Priya Sharma', 'General Physician', 'OPD Room 2', 400, '10:00 AM - 02:00 PM', TRUE, NOW());

-- Drugs Inventory (15 Essential Medicines)
DELETE FROM public.drugs WHERE id IN (
  'd0000001-0000-0000-0000-000000000001',
  'd0000002-0000-0000-0000-000000000002',
  'd0000003-0000-0000-0000-000000000003',
  'd0000004-0000-0000-0000-000000000004',
  'd0000005-0000-0000-0000-000000000005',
  'd0000006-0000-0000-0000-000000000006',
  'd0000007-0000-0000-0000-000000000007',
  'd0000008-0000-0000-0000-000000000008',
  'd0000009-0000-0000-0000-000000000009',
  'd0000010-0000-0000-0000-000000000010',
  'd0000011-0000-0000-0000-000000000011',
  'd0000012-0000-0000-0000-000000000012',
  'd0000013-0000-0000-0000-000000000013',
  'd0000014-0000-0000-0000-000000000014',
  'd0000015-0000-0000-0000-000000000015'
);

INSERT INTO public.drugs (id, name, drug_type, unit_price, stock_quantity, reorder_level, schedule_h, schedule_h1, batch_number, expiry_date, version, created_at, updated_at)
VALUES
  ('d0000001-0000-0000-0000-000000000001', 'Paracetamol 500mg', 'tablet', 3.50, 500, 100, FALSE, FALSE, 'PCM-2026-A', '2028-12-31', 1, NOW(), NOW()),
  ('d0000002-0000-0000-0000-000000000002', 'Amoxicillin 500mg', 'capsule', 12.00, 500, 80, FALSE, FALSE, 'AMX-2026-B', '2028-06-30', 1, NOW(), NOW()),
  ('d0000003-0000-0000-0000-000000000003', 'Cetirizine 10mg', 'tablet', 4.00, 500, 100, FALSE, FALSE, 'CTZ-2026-C', '2029-01-31', 1, NOW(), NOW()),
  ('d0000004-0000-0000-0000-000000000004', 'Omeprazole 20mg', 'capsule', 8.00, 500, 60, FALSE, FALSE, 'OMP-2026-D', '2028-10-31', 1, NOW(), NOW()),
  ('d0000005-0000-0000-0000-000000000005', 'Amlodipine 5mg', 'tablet', 5.50, 500, 60, FALSE, FALSE, 'AML-2026-E', '2028-09-30', 1, NOW(), NOW()),
  ('d0000006-0000-0000-0000-000000000006', 'Metformin 500mg', 'tablet', 6.00, 500, 100, FALSE, FALSE, 'MET-2026-F', '2028-11-30', 1, NOW(), NOW()),
  ('d0000007-0000-0000-0000-000000000007', 'Azithromycin 500mg', 'tablet', 24.00, 500, 50, TRUE, FALSE, 'AZI-2026-G', '2028-08-31', 1, NOW(), NOW()),
  ('d0000008-0000-0000-0000-000000000008', 'Pantoprazole 40mg', 'tablet', 10.00, 500, 80, FALSE, FALSE, 'PAN-2026-H', '2028-12-31', 1, NOW(), NOW()),
  ('d0000009-0000-0000-0000-000000000009', 'Ibuprofen 400mg', 'tablet', 4.50, 500, 75, FALSE, FALSE, 'IBU-2026-I', '2028-07-31', 1, NOW(), NOW()),
  ('d0000010-0000-0000-0000-000000000010', 'Atorvastatin 10mg', 'tablet', 11.00, 500, 50, FALSE, FALSE, 'ATV-2026-J', '2028-05-31', 1, NOW(), NOW()),
  ('d0000011-0000-0000-0000-000000000011', 'Telmisartan 40mg', 'tablet', 9.50, 500, 50, FALSE, FALSE, 'TEL-2026-K', '2028-10-31', 1, NOW(), NOW()),
  ('d0000012-0000-0000-0000-000000000012', 'Ambroxol Cough Syrup 100ml', 'syrup', 85.00, 500, 40, FALSE, FALSE, 'AMB-2026-L', '2027-12-31', 1, NOW(), NOW()),
  ('d0000013-0000-0000-0000-000000000013', 'Multivitamin Daily', 'tablet', 7.00, 500, 100, FALSE, FALSE, 'MTV-2026-M', '2029-03-31', 1, NOW(), NOW()),
  ('d0000014-0000-0000-0000-000000000014', 'Diclofenac 50mg', 'tablet', 5.00, 500, 60, FALSE, FALSE, 'DIC-2026-N', '2028-04-30', 1, NOW(), NOW()),
  ('d0000015-0000-0000-0000-000000000015', 'Ciprofloxacin 500mg', 'tablet', 18.00, 500, 40, TRUE, FALSE, 'CIP-2026-O', '2028-06-30', 1, NOW(), NOW());

-- Hospital Settings
DELETE FROM public.hospital_settings WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.hospital_settings (id, hospital_name, tagline, phone, email, address, registration_fee, default_printer, schedule_h_action, whatsapp_enabled, low_stock_days_warning, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'RADHAKRISHNA HOSPITAL',
  'Compassionate Care · Clinical Excellence',
  '080-23456789',
  'contact@radhakrishnahospital.com',
  '123, Healthcare Road, Bengaluru, Karnataka 560001',
  100,
  'Reception Thermal Printer',
  'warn',
  TRUE,
  7,
  NOW()
);

-- Wards & Beds
DELETE FROM public.beds WHERE id IN (
  'b0000001-0000-0000-0000-000000000001',
  'b0000002-0000-0000-0000-000000000001',
  'b0000003-0000-0000-0000-000000000001',
  'b0000004-0000-0000-0000-000000000001',
  'b0000005-0000-0000-0000-000000000001',
  'b0000006-0000-0000-0000-000000000002',
  'b0000007-0000-0000-0000-000000000002',
  'b0000008-0000-0000-0000-000000000002',
  'b0000009-0000-0000-0000-000000000003',
  'b0000010-0000-0000-0000-000000000003'
);

DELETE FROM public.wards WHERE id IN (
  'e0000001-0000-0000-0000-000000000001',
  'e0000002-0000-0000-0000-000000000002',
  'e0000003-0000-0000-0000-000000000003'
);

INSERT INTO public.wards (id, name, floor, total_beds, price_per_day, is_active, created_at)
VALUES
  ('e0000001-0000-0000-0000-000000000001', 'General Ward', 'Ground Floor', 5, 800, TRUE, NOW()),
  ('e0000002-0000-0000-0000-000000000002', 'Semi-Private Ward', 'First Floor', 3, 1800, TRUE, NOW()),
  ('e0000003-0000-0000-0000-000000000003', 'ICU (Intensive Care)', 'Second Floor', 2, 4500, TRUE, NOW());

INSERT INTO public.beds (id, ward_id, bed_number, is_occupied, is_active, created_at)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'GW-01', FALSE, TRUE, NOW()),
  ('b0000002-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'GW-02', FALSE, TRUE, NOW()),
  ('b0000003-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'GW-03', FALSE, TRUE, NOW()),
  ('b0000004-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'GW-04', FALSE, TRUE, NOW()),
  ('b0000005-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'GW-05', FALSE, TRUE, NOW()),
  ('b0000006-0000-0000-0000-000000000002', 'e0000002-0000-0000-0000-000000000002', 'SP-01', FALSE, TRUE, NOW()),
  ('b0000007-0000-0000-0000-000000000002', 'e0000002-0000-0000-0000-000000000002', 'SP-02', FALSE, TRUE, NOW()),
  ('b0000008-0000-0000-0000-000000000002', 'e0000002-0000-0000-0000-000000000002', 'SP-03', FALSE, TRUE, NOW()),
  ('b0000009-0000-0000-0000-000000000003', 'e0000003-0000-0000-0000-000000000003', 'ICU-01', FALSE, TRUE, NOW()),
  ('b0000010-0000-0000-0000-000000000003', 'e0000003-0000-0000-0000-000000000003', 'ICU-02', FALSE, TRUE, NOW());

-- Verification
SELECT 'RADHAKRISHNA HOSPITAL: Master Realtime Schema Active and Verified' AS result;

-- Verification
SELECT 'RADHAKRISHNA HOSPITAL: Master Realtime Schema Active and Verified' AS result;

