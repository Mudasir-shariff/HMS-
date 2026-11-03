-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- ALL-IN-ONE MASTER PRODUCTION MIGRATION (PHASES 1, 2, 4 & 5)
-- =============================================================================
-- Execute this single script in Supabase SQL Editor:
-- Supabase Dashboard -> SQL Editor -> New Query -> Paste & Run
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. SCHEMA SAFETY PRE-FLIGHT: Ensure deleted_at and version columns exist
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_profiles      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.doctors            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.patients           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.visits             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescriptions      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescription_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.lab_test_orders    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.drugs              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispensings        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispensing_items   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.wards              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.beds               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.admissions         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.hospital_settings  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drop plaintext password column from user_profiles if present (Phase 4)
ALTER TABLE IF EXISTS public.user_profiles DROP COLUMN IF EXISTS password;

-- -----------------------------------------------------------------------------
-- PHASE 1: REALTIME PUBLICATION & REPLICA IDENTITY FULL
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE 
    public.user_profiles,
    public.doctors,
    public.patients,
    public.visits,
    public.prescriptions,
    public.prescription_items,
    public.lab_test_orders,
    public.drugs,
    public.dispensings,
    public.dispensing_items,
    public.hospital_settings,
    public.wards,
    public.beds,
    public.admissions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.user_profiles      REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.doctors            REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.patients           REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.visits             REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.prescriptions      REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.prescription_items REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.lab_test_orders    REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.drugs              REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.dispensings        REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.dispensing_items   REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.hospital_settings  REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.wards              REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.beds               REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.admissions         REPLICA IDENTITY FULL;

-- -----------------------------------------------------------------------------
-- PHASE 2: CANONICAL DOCTOR KEY UNIFICATION & ATOMIC CONCURRENCY
-- -----------------------------------------------------------------------------
UPDATE public.doctors SET id = user_id WHERE id != user_id;

UPDATE public.visits v
SET doctor_id = d.user_id
FROM public.doctors d
WHERE v.doctor_id = d.id AND d.id != d.user_id;

UPDATE public.prescriptions p
SET doctor_id = d.user_id
FROM public.doctors d
WHERE p.doctor_id = d.id AND d.id != d.user_id;

UPDATE public.admissions a
SET doctor_id = d.user_id
FROM public.doctors d
WHERE a.doctor_id = d.id AND d.id != d.user_id;

-- Sequences for UHID and OPD Visit Numbers
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

-- Advisory locked Daily Token per doctor per calendar day (IST)
CREATE OR REPLACE FUNCTION public.generate_next_daily_token(
  p_doctor_id UUID,
  p_visit_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key BIGINT;
  v_next_token INT;
BEGIN
  v_lock_key := ('x' || substr(md5('token_' || p_doctor_id::TEXT || '_' || p_visit_date::TEXT), 1, 15))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO v_next_token
  FROM public.visits
  WHERE doctor_id = p_doctor_id
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = p_visit_date
    AND (deleted_at IS NULL);

  RETURN v_next_token;
END;
$$;

-- Add version column for optimistic concurrency
ALTER TABLE public.patients     ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.visits       ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.drugs        ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.dispensings  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.admissions   ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Check non-negative stock constraint on drugs
ALTER TABLE public.drugs DROP CONSTRAINT IF EXISTS drugs_stock_quantity_non_negative;
ALTER TABLE public.drugs ADD CONSTRAINT drugs_stock_quantity_non_negative CHECK (stock_quantity >= 0);

-- Version bumping trigger
CREATE OR REPLACE FUNCTION public.bump_version_and_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_bump_version ON public.patients;
CREATE TRIGGER trg_patients_bump_version BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_visits_bump_version ON public.visits;
CREATE TRIGGER trg_visits_bump_version BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_prescriptions_bump_version ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_bump_version BEFORE UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_drugs_bump_version ON public.drugs;
CREATE TRIGGER trg_drugs_bump_version BEFORE UPDATE ON public.drugs FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_dispensings_bump_version ON public.dispensings;
CREATE TRIGGER trg_dispensings_bump_version BEFORE UPDATE ON public.dispensings FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_admissions_bump_version ON public.admissions;
CREATE TRIGGER trg_admissions_bump_version BEFORE UPDATE ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

-- Atomic Patient Registration & OPD Token Generation RPC
CREATE OR REPLACE FUNCTION public.register_patient_and_visit_atomic(
  p_name TEXT,
  p_age INT,
  p_phone TEXT,
  p_doctor_id UUID,
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

-- Transactional Dispensing RPC (Atomic Stock Check & Decrement)
CREATE OR REPLACE FUNCTION public.dispense_prescription_atomic(
  p_prescription_id UUID DEFAULT NULL,
  p_pharmacist_id UUID DEFAULT NULL,
  p_pharmacist_name TEXT DEFAULT 'Pharmacist',
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
      gen_random_uuid(),
      v_dispensing_id,
      v_item.drug_id,
      COALESCE(v_item.drug_name, 'Medicine'),
      COALESCE(v_item.quantity, 1),
      COALESCE(v_item.unit_price, 0),
      COALESCE(v_item.total_price, COALESCE(v_item.quantity, 1) * COALESCE(v_item.unit_price, 0)),
      COALESCE(v_item.is_custom, FALSE),
      NOW()
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
    'dispensing_id', v_dispensing_id,
    'delivered_at', NOW()
  );
END;
$$;

-- Trigger-based append-only audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_record_id TEXT;
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id::TEXT;
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id::TEXT;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::TEXT;
    v_old_data := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_values, new_values, created_at
  ) VALUES (
    v_user_id, TG_OP, TG_TABLE_NAME, v_record_id, v_old_data, v_new_data, NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_patients ON public.patients;
CREATE TRIGGER trg_audit_patients AFTER INSERT OR UPDATE OR DELETE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_visits ON public.visits;
CREATE TRIGGER trg_audit_visits AFTER INSERT OR UPDATE OR DELETE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_prescriptions ON public.prescriptions;
CREATE TRIGGER trg_audit_prescriptions AFTER INSERT OR UPDATE OR DELETE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_drugs ON public.drugs;
CREATE TRIGGER trg_audit_drugs AFTER INSERT OR UPDATE OR DELETE ON public.drugs FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_dispensings ON public.dispensings;
CREATE TRIGGER trg_audit_dispensings AFTER INSERT OR UPDATE OR DELETE ON public.dispensings FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_admissions ON public.admissions;
CREATE TRIGGER trg_audit_admissions AFTER INSERT OR UPDATE OR DELETE ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Restore Foreign Key Constraints safely
ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_id_fkey,
  ADD CONSTRAINT doctors_id_fkey FOREIGN KEY (id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_patient_id_fkey,
  ADD CONSTRAINT visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_visit_id_fkey,
  ADD CONSTRAINT prescriptions_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;

ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_patient_id_fkey,
  ADD CONSTRAINT prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE public.prescription_items
  DROP CONSTRAINT IF EXISTS prescription_items_prescription_id_fkey,
  ADD CONSTRAINT prescription_items_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id) ON DELETE CASCADE;

ALTER TABLE public.dispensing_items
  DROP CONSTRAINT IF EXISTS dispensing_items_dispensing_id_fkey,
  ADD CONSTRAINT dispensing_items_dispensing_id_fkey FOREIGN KEY (dispensing_id) REFERENCES public.dispensings(id) ON DELETE CASCADE;

ALTER TABLE public.beds
  DROP CONSTRAINT IF EXISTS beds_ward_id_fkey,
  ADD CONSTRAINT beds_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id) ON DELETE CASCADE;

ALTER TABLE public.admissions
  DROP CONSTRAINT IF EXISTS admissions_patient_id_fkey,
  ADD CONSTRAINT admissions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- PHASE 4: ROLE-BASED ACCESS CONTROL (RLS) POLICIES
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.get_current_user_role() = 'admin'::public.user_role, FALSE);
$$;

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
ALTER TABLE public.hospital_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select_authenticated" ON public.user_profiles;
CREATE POLICY "user_profiles_select_authenticated" ON public.user_profiles FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "user_profiles_update_self_or_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_update_self_or_admin" ON public.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "user_profiles_admin_all" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_all" ON public.user_profiles FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "doctors_select_all" ON public.doctors;
CREATE POLICY "doctors_select_all" ON public.doctors FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "doctors_update_self_or_admin" ON public.doctors;
CREATE POLICY "doctors_update_self_or_admin" ON public.doctors FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "patients_select_authenticated" ON public.patients;
CREATE POLICY "patients_select_authenticated" ON public.patients FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "patients_insert_staff" ON public.patients;
CREATE POLICY "patients_insert_staff" ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() IN ('admin', 'receptionist', 'doctor'));

DROP POLICY IF EXISTS "patients_update_staff" ON public.patients;
CREATE POLICY "patients_update_staff" ON public.patients FOR UPDATE TO authenticated
  USING (public.get_current_user_role() IN ('admin', 'receptionist', 'doctor'));

DROP POLICY IF EXISTS "visits_select_scoped" ON public.visits;
CREATE POLICY "visits_select_scoped" ON public.visits FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.get_current_user_role() IN ('admin', 'receptionist', 'pharmacist')
      OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "visits_insert_reception_or_admin" ON public.visits;
CREATE POLICY "visits_insert_reception_or_admin" ON public.visits FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() IN ('admin', 'receptionist'));

DROP POLICY IF EXISTS "visits_update_staff" ON public.visits;
CREATE POLICY "visits_update_staff" ON public.visits FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() IN ('admin', 'receptionist', 'pharmacist')
    OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
  );

DROP POLICY IF EXISTS "prescriptions_select_all" ON public.prescriptions;
CREATE POLICY "prescriptions_select_all" ON public.prescriptions FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "prescriptions_insert_doctor_or_admin" ON public.prescriptions;
CREATE POLICY "prescriptions_insert_doctor_or_admin" ON public.prescriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid()));

DROP POLICY IF EXISTS "prescriptions_update_doctor_or_admin" ON public.prescriptions;
CREATE POLICY "prescriptions_update_doctor_or_admin" ON public.prescriptions FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
    OR public.get_current_user_role() = 'pharmacist'
  );

DROP POLICY IF EXISTS "prescription_items_all" ON public.prescription_items;
CREATE POLICY "prescription_items_all" ON public.prescription_items FOR ALL TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "drugs_select_authenticated" ON public.drugs;
CREATE POLICY "drugs_select_authenticated" ON public.drugs FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "drugs_modify_pharmacist_or_admin" ON public.drugs;
CREATE POLICY "drugs_modify_pharmacist_or_admin" ON public.drugs FOR ALL TO authenticated
  USING (public.get_current_user_role() IN ('pharmacist', 'admin'));

DROP POLICY IF EXISTS "dispensings_select_authenticated" ON public.dispensings;
CREATE POLICY "dispensings_select_authenticated" ON public.dispensings FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "dispensings_modify_pharmacist_or_admin" ON public.dispensings;
CREATE POLICY "dispensings_modify_pharmacist_or_admin" ON public.dispensings FOR ALL TO authenticated
  USING (public.get_current_user_role() IN ('pharmacist', 'admin'));

DROP POLICY IF EXISTS "dispensing_items_all" ON public.dispensing_items;
CREATE POLICY "dispensing_items_all" ON public.dispensing_items FOR ALL TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "wards_all" ON public.wards;
CREATE POLICY "wards_all" ON public.wards FOR ALL TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "beds_all" ON public.beds;
CREATE POLICY "beds_all" ON public.beds FOR ALL TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "admissions_all" ON public.admissions;
CREATE POLICY "admissions_all" ON public.admissions FOR ALL TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "settings_select" ON public.hospital_settings;
CREATE POLICY "settings_select" ON public.hospital_settings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "settings_modify" ON public.hospital_settings;
CREATE POLICY "settings_modify" ON public.hospital_settings FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- PHASE 5: PERFORMANCE INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_visits_doctor_status_date
  ON public.visits (doctor_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visits_patient_id
  ON public.visits (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_phone
  ON public.patients (phone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_uhid
  ON public.patients (uhid)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id
  ON public.prescriptions (visit_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dispensings_created_at
  ON public.dispensings (created_at DESC);

COMMIT;

