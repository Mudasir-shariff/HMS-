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
CREATE TABLE public.user_profiles (
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

CREATE TABLE public.doctors (
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

CREATE TABLE public.patients (
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

CREATE TRIGGER trg_set_uhid
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION set_uhid();

-- ════════════════════════════════════════════════════════════════
--  VISITS (OPD)
-- ════════════════════════════════════════════════════════════════

CREATE TYPE visit_status AS ENUM (
  'waiting', 'in_consultation', 'prescribed', 'dispensed', 'completed'
);

CREATE TABLE public.visits (
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
  NEW.token_number := next_daily_token();
  NEW.visit_number := 'V-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')
                              || '-' || LPAD(NEW.token_number::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_visit_defaults
  BEFORE INSERT ON public.visits
  FOR EACH ROW EXECUTE FUNCTION set_visit_defaults();

-- ════════════════════════════════════════════════════════════════
--  PRESCRIPTIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE public.prescriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    UUID NOT NULL UNIQUE REFERENCES public.visits,
  doctor_id   UUID NOT NULL REFERENCES public.doctors,
  patient_id  UUID NOT NULL REFERENCES public.patients,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE dose_relation AS ENUM ('before_food', 'after_food');

CREATE TABLE public.prescription_items (
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

CREATE TABLE public.lab_test_orders (
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

CREATE TABLE public.drugs (
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

CREATE TABLE public.dispensings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID REFERENCES public.prescriptions,  -- NULL for walk-in
  patient_id       UUID REFERENCES public.patients,
  pharmacist_id    UUID NOT NULL REFERENCES public.user_profiles,
  is_walk_in       BOOLEAN NOT NULL DEFAULT FALSE,
  total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.dispensing_items (
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

CREATE TABLE public.wards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.beds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id      UUID NOT NULL REFERENCES public.wards,
  bed_number   TEXT NOT NULL,
  price_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_occupied  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE ip_status AS ENUM ('admitted', 'discharged');

CREATE TABLE public.admissions (
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

CREATE TRIGGER trg_set_uaid
  BEFORE INSERT ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION set_uaid();

-- ════════════════════════════════════════════════════════════════
--  AUDIT LOG
-- ════════════════════════════════════════════════════════════════

CREATE TABLE public.audit_logs (
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

CREATE TABLE public.hospital_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name           TEXT NOT NULL DEFAULT 'Hospital',
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

-- ════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_test_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role LANGUAGE SQL STABLE AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ── Patients: all roles can read, receptionist/admin can write ──
CREATE POLICY "patients_read_all"  ON public.patients FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "patients_write"     ON public.patients FOR INSERT WITH CHECK (get_my_role() IN ('admin','receptionist'));
CREATE POLICY "patients_update"    ON public.patients FOR UPDATE USING (get_my_role() IN ('admin','receptionist'));

-- ── Visits: all roles can read, receptionist/admin create, doctor updates ──
CREATE POLICY "visits_read"   ON public.visits FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "visits_insert" ON public.visits FOR INSERT WITH CHECK (get_my_role() IN ('admin','receptionist'));
CREATE POLICY "visits_update" ON public.visits FOR UPDATE USING (get_my_role() IN ('admin','receptionist','doctor'));

-- ── Prescriptions: all read; doctor creates/updates ──
CREATE POLICY "rx_read"   ON public.prescriptions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "rx_write"  ON public.prescriptions FOR INSERT WITH CHECK (get_my_role() IN ('admin','doctor'));
CREATE POLICY "rx_update" ON public.prescriptions FOR UPDATE USING (get_my_role() IN ('admin','doctor'));

CREATE POLICY "rx_items_read"  ON public.prescription_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "rx_items_write" ON public.prescription_items FOR ALL USING (get_my_role() IN ('admin','doctor'));

CREATE POLICY "lab_read"  ON public.lab_test_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lab_write" ON public.lab_test_orders FOR ALL USING (get_my_role() IN ('admin','doctor'));

-- ── Drugs: all read; pharmacist/admin write ──
CREATE POLICY "drugs_read"  ON public.drugs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "drugs_write" ON public.drugs FOR ALL USING (get_my_role() IN ('admin','pharmacist'));

-- ── Dispensing: pharmacist/admin only ──
CREATE POLICY "disp_read"  ON public.dispensings FOR SELECT USING (get_my_role() IN ('admin','pharmacist'));
CREATE POLICY "disp_write" ON public.dispensings FOR ALL USING (get_my_role() IN ('admin','pharmacist'));
CREATE POLICY "disp_items_all" ON public.dispensing_items FOR ALL USING (get_my_role() IN ('admin','pharmacist'));

-- ── IP: receptionist/admin manage beds/wards/admissions ──
CREATE POLICY "wards_read"   ON public.wards FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "wards_write"  ON public.wards FOR ALL USING (get_my_role() IN ('admin','receptionist'));
CREATE POLICY "beds_read"    ON public.beds FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "beds_write"   ON public.beds FOR ALL USING (get_my_role() IN ('admin','receptionist'));
CREATE POLICY "admissions_read"  ON public.admissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admissions_write" ON public.admissions FOR ALL USING (get_my_role() IN ('admin','receptionist'));

-- ── Audit log: admin read only; insert via server-side only ──
CREATE POLICY "audit_read"   ON public.audit_logs FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Settings: admin only ──
CREATE POLICY "settings_read"  ON public.hospital_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings_write" ON public.hospital_settings FOR ALL USING (get_my_role() = 'admin');

-- ── User profiles: own profile or admin ──
CREATE POLICY "profiles_read_own"  ON public.user_profiles FOR SELECT USING (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY "profiles_update_own" ON public.user_profiles FOR UPDATE USING (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY "profiles_insert"    ON public.user_profiles FOR INSERT WITH CHECK (get_my_role() = 'admin');

-- ── Doctors: all read ──
CREATE POLICY "doctors_read"  ON public.doctors FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "doctors_write" ON public.doctors FOR ALL USING (get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
--  USEFUL INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX idx_patients_phone ON public.patients (phone);
CREATE INDEX idx_patients_uhid  ON public.patients (uhid);
CREATE INDEX idx_visits_patient ON public.visits (patient_id);
CREATE INDEX idx_visits_doctor  ON public.visits (doctor_id);
CREATE INDEX idx_visits_status  ON public.visits (status);
CREATE INDEX idx_visits_created ON public.visits (created_at DESC);
CREATE INDEX idx_drugs_name     ON public.drugs USING GIN (to_tsvector('english', name));
CREATE INDEX idx_drugs_expiry   ON public.drugs (expiry_date);
CREATE INDEX idx_dispensings_rx ON public.dispensings (prescription_id);

-- ════════════════════════════════════════════════════════════════
--  REALTIME — enable for live queues
-- ════════════════════════════════════════════════════════════════

-- Run in Supabase dashboard: Database > Replication, or:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.dispensings;
