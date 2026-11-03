-- ════════════════════════════════════════════════════════════════
-- Hospital Management System — Supabase / PostgreSQL Schema
-- Run this in Supabase SQL Editor to initialise the database.
-- ════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Sequences for human-readable IDs ────────────────────────────
CREATE SEQUENCE IF NOT EXISTS uhid_seq START 1;
CREATE SEQUENCE IF NOT EXISTS uaid_seq START 1;

-- ════════════════════════════════════════════════════════════════
--  USERS / ROLES
-- ════════════════════════════════════════════════════════════════

CREATE TYPE user_role AS ENUM ('admin', 'receptionist', 'doctor', 'pharmacist');

-- Extends Supabase auth.users
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'receptionist',
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  DOCTORS (extends user_profiles)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.doctors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES public.user_profiles ON DELETE CASCADE,
  specialization    TEXT,
  consultation_room TEXT,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  PATIENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.patients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uhid             TEXT NOT NULL UNIQUE,   -- H-XXXXX
  name             TEXT NOT NULL,
  age              SMALLINT NOT NULL CHECK (age BETWEEN 0 AND 120),
  phone            TEXT NOT NULL,
  blood_group      TEXT,
  has_bp           BOOLEAN NOT NULL DEFAULT FALSE,
  has_sugar        BOOLEAN NOT NULL DEFAULT FALSE,
  other_conditions TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Function: generate UHID ──
CREATE OR REPLACE FUNCTION generate_uhid()
RETURNS TEXT LANGUAGE SQL AS $$
  SELECT 'H-' || LPAD(nextval('uhid_seq')::TEXT, 5, '0');
$$;

-- ── Trigger: auto-fill UHID before insert ──
CREATE OR REPLACE FUNCTION set_uhid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.uhid IS NULL OR NEW.uhid = '' THEN
    NEW.uhid := generate_uhid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_uhid ON public.patients;
CREATE TRIGGER trg_set_uhid
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION set_uhid();

-- ════════════════════════════════════════════════════════════════
--  VISITS (OPD)
-- ════════════════════════════════════════════════════════════════

CREATE TYPE visit_status AS ENUM (
  'waiting', 'in_consultation', 'prescribed', 'dispensed', 'completed'
);

CREATE TABLE IF NOT EXISTS public.visits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_number   TEXT NOT NULL UNIQUE,   -- auto-generated
  patient_id     UUID NOT NULL REFERENCES public.patients,
  doctor_id      UUID NOT NULL REFERENCES public.doctors,
  token_number   SMALLINT NOT NULL,
  status         visit_status NOT NULL DEFAULT 'waiting',
  follow_up_date DATE,
  instructions   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Function: generate daily token (resets at configurable hour) ──
CREATE OR REPLACE FUNCTION next_daily_token()
RETURNS SMALLINT LANGUAGE plpgsql AS $$
DECLARE
  reset_hour SMALLINT;
  today_start TIMESTAMPTZ;
  max_token  SMALLINT;
BEGIN
  SELECT COALESCE(token_reset_hour, 0) INTO reset_hour FROM public.hospital_settings LIMIT 1;
  today_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Kolkata')
                   + (reset_hour || ' hours')::INTERVAL;
  SELECT COALESCE(MAX(token_number), 0) INTO max_token
    FROM public.visits
   WHERE created_at >= today_start;
  RETURN max_token + 1;
END;
$$;

-- ── Trigger: auto-set token and visit_number ──
CREATE OR REPLACE FUNCTION set_visit_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_number IS NULL OR NEW.token_number = 0 THEN
    NEW.token_number := next_daily_token();
  END IF;
  IF NEW.visit_number IS NULL OR NEW.visit_number = '' THEN
    NEW.visit_number := 'V-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')
                                || '-' || LPAD(NEW.token_number::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_visit_defaults ON public.visits;
CREATE TRIGGER trg_set_visit_defaults
  BEFORE INSERT ON public.visits
  FOR EACH ROW EXECUTE FUNCTION set_visit_defaults();

-- ════════════════════════════════════════════════════════════════
--  PRESCRIPTIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    UUID NOT NULL UNIQUE REFERENCES public.visits,
  doctor_id   UUID NOT NULL REFERENCES public.doctors,
  patient_id  UUID NOT NULL REFERENCES public.patients,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE dose_relation AS ENUM ('before_food', 'after_food');

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES public.prescriptions ON DELETE CASCADE,
  drug_id          UUID NOT NULL,  -- references drugs
  drug_name        TEXT NOT NULL,  -- snapshot
  dose_morning     BOOLEAN NOT NULL DEFAULT FALSE,
  dose_afternoon   BOOLEAN NOT NULL DEFAULT FALSE,
  dose_night       BOOLEAN NOT NULL DEFAULT FALSE,
  dose_relation    dose_relation NOT NULL DEFAULT 'after_food',
  num_days         SMALLINT NOT NULL CHECK (num_days > 0),
  quantity         SMALLINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lab_test_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES public.prescriptions ON DELETE CASCADE,
  test_name        TEXT NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  PHARMACY / INVENTORY
-- ════════════════════════════════════════════════════════════════

CREATE TYPE drug_type AS ENUM ('tablet', 'capsule', 'syrup', 'other');

CREATE TABLE IF NOT EXISTS public.drugs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  drug_type         drug_type NOT NULL,
  custom_type_name  TEXT,
  expiry_date       DATE NOT NULL,
  purchase_price    NUMERIC(10,2) NOT NULL CHECK (purchase_price >= 0),
  selling_price     NUMERIC(10,2) NOT NULL CHECK (selling_price >= 0),
  stock_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_limit   INTEGER NOT NULL DEFAULT 30,
  boxes             INTEGER,
  tablets_per_sheet INTEGER,
  price_per_sheet   NUMERIC(10,2),
  price_per_unit    NUMERIC(10,2),
  batch_number      TEXT,
  schedule_h        BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_h1       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dispensings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID REFERENCES public.prescriptions,  -- NULL for walk-in
  patient_id       UUID REFERENCES public.patients,
  pharmacist_id    UUID NOT NULL REFERENCES public.user_profiles,
  is_walk_in       BOOLEAN NOT NULL DEFAULT FALSE,
  total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dispensing_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensing_id  UUID NOT NULL REFERENCES public.dispensings ON DELETE CASCADE,
  drug_id        UUID NOT NULL REFERENCES public.drugs,
  drug_name      TEXT NOT NULL,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(10,2) NOT NULL,
  total_price    NUMERIC(10,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Function: reduce stock atomically on dispensing ──
CREATE OR REPLACE FUNCTION reduce_stock_on_dispense(
  p_drug_id UUID,
  p_quantity INTEGER
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.drugs
     SET stock_quantity = stock_quantity - p_quantity,
         updated_at     = NOW()
   WHERE id = p_drug_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drug not found: %', p_drug_id;
  END IF;
  IF (SELECT stock_quantity FROM public.drugs WHERE id = p_drug_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for drug %', p_drug_id;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
--  IP ADMISSION (v1.1)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.beds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id      UUID NOT NULL REFERENCES public.wards,
  bed_number   TEXT NOT NULL,
  price_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_occupied  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE ip_status AS ENUM ('admitted', 'discharged');

CREATE TABLE IF NOT EXISTS public.admissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uaid                  TEXT NOT NULL UNIQUE,
  patient_id            UUID NOT NULL REFERENCES public.patients,
  bed_id                UUID NOT NULL REFERENCES public.beds,
  doctor_id             UUID NOT NULL REFERENCES public.doctors,
  diagnosis             TEXT,
  has_bp                BOOLEAN NOT NULL DEFAULT FALSE,
  has_sugar             BOOLEAN NOT NULL DEFAULT FALSE,
  other_conditions      TEXT,
  status                ip_status NOT NULL DEFAULT 'admitted',
  admitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharged_at         TIMESTAMPTZ,
  hours_per_day         SMALLINT NOT NULL DEFAULT 18,
  total_bed_charges     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_pharmacy_charges NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_lab_charges     NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION set_uaid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.uaid IS NULL OR NEW.uaid = '' THEN
    NEW.uaid := 'IP-' || LPAD(nextval('uaid_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_uaid ON public.admissions;
CREATE TRIGGER trg_set_uaid
  BEFORE INSERT ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION set_uaid();

-- ════════════════════════════════════════════════════════════════
--  AUDIT LOG
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.user_profiles,
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  HOSPITAL SETTINGS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hospital_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name           TEXT NOT NULL DEFAULT 'RADHAKRISHNA HOSPITAL',
  hospital_logo_url       TEXT,
  address                 TEXT,
  phone                   TEXT,
  token_reset_hour        SMALLINT NOT NULL DEFAULT 0 CHECK (token_reset_hour BETWEEN 0 AND 23),
  ip_hours_per_day        SMALLINT NOT NULL DEFAULT 18 CHECK (ip_hours_per_day > 0),
  prescription_paper_size TEXT NOT NULL DEFAULT 'A4' CHECK (prescription_paper_size IN ('A4','A5')),
  prescription_header     TEXT,
  prescription_footer     TEXT,
  low_stock_days_warning  SMALLINT NOT NULL DEFAULT 7,
  expiry_days_warning     SMALLINT[] NOT NULL DEFAULT '{90,60,30}',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed one row of settings
INSERT INTO public.hospital_settings (hospital_name, address, phone)
  VALUES ('RADHAKRISHNA HOSPITAL', 'Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka', '+91 8154 252222')
  ON CONFLICT DO NOTHING;

-- Seed default hospital wards
INSERT INTO public.wards (id, name, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'General Ward Male', true),
  ('a0000000-0000-0000-0000-000000000002', 'General Ward Female', true),
  ('a0000000-0000-0000-0000-000000000003', 'ICU & Critical Care', true),
  ('a0000000-0000-0000-0000-000000000004', 'Private Deluxe Suite', true)
  ON CONFLICT (id) DO NOTHING;

-- Seed default beds
INSERT INTO public.beds (id, ward_id, bed_number, price_per_day, is_occupied) VALUES
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'Bed 101', 1200, false),
  ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', 'Bed 102', 1200, false),
  ('b0000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000001', 'Bed 103', 1200, false),
  ('b0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000002', 'Bed 201', 1200, false),
  ('b0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000002', 'Bed 202', 1200, false),
  ('b0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000003', 'ICU Bed 1', 4500, false),
  ('b0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000004', 'Suite 401', 3500, false)
  ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
--  AUTOMATIC USER PROVISIONING TRIGGER (Auth -> Profiles & Doctors)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role := 'receptionist';
  v_full_name text;
  v_phone text;
  v_spec text;
  v_room text;
BEGIN
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_phone := new.raw_user_meta_data->>'phone';
  v_spec := new.raw_user_meta_data->>'specialization';
  v_room := new.raw_user_meta_data->>'consultation_room';

  IF (new.raw_user_meta_data->>'role') IS NOT NULL THEN
    BEGIN
      v_role := (new.raw_user_meta_data->>'role')::user_role;
    EXCEPTION WHEN OTHERS THEN
      v_role := 'receptionist';
    END;
  END IF;

  -- Upsert into user_profiles
  INSERT INTO public.user_profiles (id, full_name, role, phone, is_active)
  VALUES (new.id, v_full_name, v_role, v_phone, true)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        phone = COALESCE(EXCLUDED.phone, user_profiles.phone);

  -- If doctor, also upsert doctor profile
  IF v_role = 'doctor' THEN
    INSERT INTO public.doctors (user_id, specialization, consultation_room, is_available)
    VALUES (new.id, COALESCE(v_spec, 'General Medicine'), COALESCE(v_room, 'Room 1'), true)
    ON CONFLICT (user_id) DO UPDATE
      SET specialization = EXCLUDED.specialization,
          consultation_room = EXCLUDED.consultation_room;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger whenever user registers or updates in Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Automatic backfill of existing registered auth users
INSERT INTO public.user_profiles (id, full_name, role, phone, is_active)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  COALESCE(NULLIF(raw_user_meta_data->>'role', '')::user_role, 'receptionist'),
  raw_user_meta_data->>'phone',
  true
FROM auth.users
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      phone = COALESCE(EXCLUDED.phone, user_profiles.phone);

INSERT INTO public.doctors (user_id, specialization, consultation_room, is_available)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'specialization', 'General Medicine'),
  COALESCE(raw_user_meta_data->>'consultation_room', 'Room 1'),
  true
FROM auth.users
WHERE (raw_user_meta_data->>'role') = 'doctor'
ON CONFLICT (user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS) POLICIES
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_test_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_settings  ENABLE ROW LEVEL SECURITY;

-- ── 1. User Profiles & Staff ──
DROP POLICY IF EXISTS "profiles_read_all" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_write_all" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.user_profiles;
CREATE POLICY "profiles_read_all"  ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_write_all" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Doctors ──
DROP POLICY IF EXISTS "doctors_read_all" ON public.doctors;
DROP POLICY IF EXISTS "doctors_write_all" ON public.doctors;
DROP POLICY IF EXISTS "doctors_read" ON public.doctors;
DROP POLICY IF EXISTS "doctors_write" ON public.doctors;
CREATE POLICY "doctors_read_all"  ON public.doctors FOR SELECT USING (true);
CREATE POLICY "doctors_write_all" ON public.doctors FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Hospital Settings ──
DROP POLICY IF EXISTS "settings_read_all" ON public.hospital_settings;
DROP POLICY IF EXISTS "settings_write_all" ON public.hospital_settings;
DROP POLICY IF EXISTS "settings_read" ON public.hospital_settings;
DROP POLICY IF EXISTS "settings_write" ON public.hospital_settings;
CREATE POLICY "settings_read_all"  ON public.hospital_settings FOR SELECT USING (true);
CREATE POLICY "settings_write_all" ON public.hospital_settings FOR ALL USING (true) WITH CHECK (true);

-- ── 4. Patients ──
DROP POLICY IF EXISTS "patients_all" ON public.patients;
DROP POLICY IF EXISTS "patients_read_all" ON public.patients;
DROP POLICY IF EXISTS "patients_write" ON public.patients;
DROP POLICY IF EXISTS "patients_update" ON public.patients;
CREATE POLICY "patients_all" ON public.patients FOR ALL USING (true) WITH CHECK (true);

-- ── 5. Visits (OPD) ──
DROP POLICY IF EXISTS "visits_all" ON public.visits;
DROP POLICY IF EXISTS "visits_read" ON public.visits;
DROP POLICY IF EXISTS "visits_insert" ON public.visits;
DROP POLICY IF EXISTS "visits_update" ON public.visits;
CREATE POLICY "visits_all" ON public.visits FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Prescriptions & Line Items ──
DROP POLICY IF EXISTS "rx_all" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_items_all" ON public.prescription_items;
DROP POLICY IF EXISTS "rx_read" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_write" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_update" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_items_read" ON public.prescription_items;
DROP POLICY IF EXISTS "rx_items_write" ON public.prescription_items;
CREATE POLICY "rx_all" ON public.prescriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rx_items_all" ON public.prescription_items FOR ALL USING (true) WITH CHECK (true);

-- ── 7. Lab Tests ──
DROP POLICY IF EXISTS "lab_all" ON public.lab_test_orders;
DROP POLICY IF EXISTS "lab_read" ON public.lab_test_orders;
DROP POLICY IF EXISTS "lab_write" ON public.lab_test_orders;
CREATE POLICY "lab_all" ON public.lab_test_orders FOR ALL USING (true) WITH CHECK (true);

-- ── 8. Pharmacy Drugs & Inventory ──
DROP POLICY IF EXISTS "drugs_all" ON public.drugs;
DROP POLICY IF EXISTS "drugs_read" ON public.drugs;
DROP POLICY IF EXISTS "drugs_write" ON public.drugs;
CREATE POLICY "drugs_all" ON public.drugs FOR ALL USING (true) WITH CHECK (true);

-- ── 9. Dispensings & Line Items ──
DROP POLICY IF EXISTS "disp_all" ON public.dispensings;
DROP POLICY IF EXISTS "disp_items_all" ON public.dispensing_items;
DROP POLICY IF EXISTS "disp_read" ON public.dispensings;
DROP POLICY IF EXISTS "disp_write" ON public.dispensings;
CREATE POLICY "disp_all" ON public.dispensings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "disp_items_all" ON public.dispensing_items FOR ALL USING (true) WITH CHECK (true);

-- ── 10. In-Patient: Wards, Beds & Admissions ──
DROP POLICY IF EXISTS "wards_all" ON public.wards;
DROP POLICY IF EXISTS "beds_all" ON public.beds;
DROP POLICY IF EXISTS "admissions_all" ON public.admissions;
DROP POLICY IF EXISTS "wards_read" ON public.wards;
DROP POLICY IF EXISTS "wards_write" ON public.wards;
DROP POLICY IF EXISTS "beds_read" ON public.beds;
DROP POLICY IF EXISTS "beds_write" ON public.beds;
DROP POLICY IF EXISTS "admissions_read" ON public.admissions;
DROP POLICY IF EXISTS "admissions_write" ON public.admissions;
CREATE POLICY "wards_all" ON public.wards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "beds_all" ON public.beds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admissions_all" ON public.admissions FOR ALL USING (true) WITH CHECK (true);

-- ── 11. Audit Logs ──
DROP POLICY IF EXISTS "audit_all" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_read" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_all" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
--  USEFUL INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients (phone);
CREATE INDEX IF NOT EXISTS idx_patients_uhid  ON public.patients (uhid);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON public.visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_doctor  ON public.visits (doctor_id);
CREATE INDEX IF NOT EXISTS idx_visits_status  ON public.visits (status);
CREATE INDEX IF NOT EXISTS idx_visits_created ON public.visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drugs_name     ON public.drugs USING GIN (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_drugs_expiry   ON public.drugs (expiry_date);
CREATE INDEX IF NOT EXISTS idx_dispensings_rx ON public.dispensings (prescription_id);
