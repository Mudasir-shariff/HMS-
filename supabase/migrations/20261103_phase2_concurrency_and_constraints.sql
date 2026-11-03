-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- PHASE 2 MIGRATION: Concurrency, Atomic RPCs, Canonical Doctor Keys,
--                    Constraints, Versioning & Audit Logs
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CANONICAL DOCTOR KEY UNIFICATION
-- -----------------------------------------------------------------------------
-- Ensure doctors.id is strictly equal to user_profiles.id (1:1 primary key)
UPDATE public.doctors SET id = user_id WHERE id != user_id;

-- Backfill any references in visits, prescriptions, admissions
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

-- -----------------------------------------------------------------------------
-- 2. SEQUENCES FOR UHID & OPD VISIT NUMBERS
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.uhid_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.opd_visit_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.generate_next_uhid()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'H-' || LPAD(nextval('public.uhid_seq')::TEXT, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.generate_next_visit_number()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'OPD-' || TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || LPAD(nextval('public.opd_visit_seq')::TEXT, 4, '0');
$$;

-- -----------------------------------------------------------------------------
-- 3. DAILY TOKEN GENERATION WITH TRANSACTION ADVISORY LOCKING (IST)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_next_daily_token(
  p_doctor_id UUID,
  p_visit_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock_key BIGINT;
  v_next_token INT;
BEGIN
  -- Acquire advisory xact lock per doctor per IST date to prevent race conditions
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

-- -----------------------------------------------------------------------------
-- 4. SOFT DELETES & OPTIMISTIC CONCURRENCY (version column)
-- -----------------------------------------------------------------------------
-- Add version column and deleted_at column to primary tables
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.drugs
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.dispensings
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Non-negative stock check constraint on drugs
ALTER TABLE public.drugs DROP CONSTRAINT IF EXISTS drugs_stock_quantity_non_negative;
ALTER TABLE public.drugs ADD CONSTRAINT drugs_stock_quantity_non_negative CHECK (stock_quantity >= 0);

-- Trigger function to bump version and updated_at on record updates
CREATE OR REPLACE FUNCTION public.bump_version_and_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_bump_version ON public.patients;
CREATE TRIGGER trg_patients_bump_version
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_visits_bump_version ON public.visits;
CREATE TRIGGER trg_visits_bump_version
  BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_prescriptions_bump_version ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_bump_version
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_drugs_bump_version ON public.drugs;
CREATE TRIGGER trg_drugs_bump_version
  BEFORE UPDATE ON public.drugs
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_dispensings_bump_version ON public.dispensings;
CREATE TRIGGER trg_dispensings_bump_version
  BEFORE UPDATE ON public.dispensings
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

DROP TRIGGER IF EXISTS trg_admissions_bump_version ON public.admissions;
CREATE TRIGGER trg_admissions_bump_version
  BEFORE UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();

-- -----------------------------------------------------------------------------
-- 5. ATOMIC PATIENT REGISTRATION & VISIT RPC
-- -----------------------------------------------------------------------------
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
  -- Look for existing patient by phone or UHID
  IF p_uhid IS NOT NULL AND p_uhid != '' THEN
    SELECT * INTO v_patient FROM public.patients WHERE uhid = UPPER(TRIM(p_uhid)) AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  END IF;

  IF v_patient.id IS NULL AND p_phone IS NOT NULL AND LENGTH(TRIM(p_phone)) >= 10 THEN
    SELECT * INTO v_patient FROM public.patients WHERE phone = TRIM(p_phone) AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  END IF;

  IF v_patient.id IS NOT NULL THEN
    v_patient_id := v_patient.id;
    v_uhid := v_patient.uhid;
    -- Update medical history if provided
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
    -- Generate new UHID
    v_uhid := public.generate_next_uhid();
    v_patient_id := gen_random_uuid();

    INSERT INTO public.patients (
      id, uhid, name, age, phone, blood_group, has_bp, has_sugar, other_conditions, version, created_at, updated_at
    ) VALUES (
      v_patient_id, v_uhid, TRIM(p_name), p_age, TRIM(p_phone), p_blood_group, p_has_bp, p_has_sugar, p_other_conditions, 1, NOW(), NOW()
    ) RETURNING * INTO v_patient;
  END IF;

  -- Generate atomic token with lock and visit number
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

-- -----------------------------------------------------------------------------
-- 6. TRANSACTIONAL DISPENSING RPC (Atomic Stock Check & Decrement)
-- -----------------------------------------------------------------------------
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
  v_item_price NUMERIC;
  v_item_name TEXT;
  v_item_is_custom BOOLEAN;
  v_has_schedule_h BOOLEAN := FALSE;
BEGIN
  -- 1. If linked to prescription, check & lock visit to prevent double dispensing
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

  -- 2. Verify stock availability and decrement atomically
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
    v_item_is_custom := COALESCE(v_item.is_custom, FALSE);

    IF v_item_drug_id IS NOT NULL AND NOT v_item_is_custom THEN
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

      -- Decrement stock atomically
      UPDATE public.drugs
      SET stock_quantity = stock_quantity - v_item_qty,
          updated_at = NOW()
      WHERE id = v_item_drug_id;
    END IF;
  END LOOP;

  -- 3. Create dispensing header
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

  -- 4. Create dispensing line items
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

  -- 5. Mark visit status as dispensed if linked
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

-- -----------------------------------------------------------------------------
-- 7. APPEND-ONLY AUDIT LOG TRIGGER
-- -----------------------------------------------------------------------------
-- Ensure audit_logs table structure supports null user_id and all operations
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
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_record_id TEXT;
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
BEGIN
  -- Extract actor user id from Supabase auth session if present
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
CREATE TRIGGER trg_audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_visits ON public.visits;
CREATE TRIGGER trg_audit_visits
  AFTER INSERT OR UPDATE OR DELETE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_prescriptions ON public.prescriptions;
CREATE TRIGGER trg_audit_prescriptions
  AFTER INSERT OR UPDATE OR DELETE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_drugs ON public.drugs;
CREATE TRIGGER trg_audit_drugs
  AFTER INSERT OR UPDATE OR DELETE ON public.drugs
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_dispensings ON public.dispensings;
CREATE TRIGGER trg_audit_dispensings
  AFTER INSERT OR UPDATE OR DELETE ON public.dispensings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_admissions ON public.admissions;
CREATE TRIGGER trg_audit_admissions
  AFTER INSERT OR UPDATE OR DELETE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- -----------------------------------------------------------------------------
-- 8. RESTORE PRIMARY, FOREIGN KEY & UNIQUE CONSTRAINTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_id_fkey,
  ADD CONSTRAINT doctors_id_fkey FOREIGN KEY (id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_patient_id_fkey,
  ADD CONSTRAINT visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_doctor_id_fkey,
  ADD CONSTRAINT visits_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE RESTRICT;

ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_visit_id_fkey,
  ADD CONSTRAINT prescriptions_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;

ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_patient_id_fkey,
  ADD CONSTRAINT prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey,
  ADD CONSTRAINT prescriptions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE RESTRICT;

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

ALTER TABLE public.admissions
  DROP CONSTRAINT IF EXISTS admissions_bed_id_fkey,
  ADD CONSTRAINT admissions_bed_id_fkey FOREIGN KEY (bed_id) REFERENCES public.beds(id) ON DELETE RESTRICT;

ALTER TABLE public.admissions
  DROP CONSTRAINT IF EXISTS admissions_doctor_id_fkey,
  ADD CONSTRAINT admissions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE RESTRICT;

COMMIT;

/*
-- =============================================================================
-- ROLLBACK SCRIPT FOR PHASE 2
-- =============================================================================
BEGIN;
  DROP TRIGGER IF EXISTS trg_audit_admissions ON public.admissions;
  DROP TRIGGER IF EXISTS trg_audit_dispensings ON public.dispensings;
  DROP TRIGGER IF EXISTS trg_audit_drugs ON public.drugs;
  DROP TRIGGER IF EXISTS trg_audit_prescriptions ON public.prescriptions;
  DROP TRIGGER IF EXISTS trg_audit_visits ON public.visits;
  DROP TRIGGER IF EXISTS trg_audit_patients ON public.patients;
  DROP FUNCTION IF EXISTS public.log_audit_event();

  DROP TRIGGER IF EXISTS trg_admissions_bump_version ON public.admissions;
  DROP TRIGGER IF EXISTS trg_dispensings_bump_version ON public.dispensings;
  DROP TRIGGER IF EXISTS trg_drugs_bump_version ON public.drugs;
  DROP TRIGGER IF EXISTS trg_prescriptions_bump_version ON public.prescriptions;
  DROP TRIGGER IF EXISTS trg_visits_bump_version ON public.visits;
  DROP TRIGGER IF EXISTS trg_patients_bump_version ON public.patients;
  DROP FUNCTION IF EXISTS public.bump_version_and_updated_at();

  DROP FUNCTION IF EXISTS public.dispense_prescription_atomic;
  DROP FUNCTION IF EXISTS public.register_patient_and_visit_atomic;
  DROP FUNCTION IF EXISTS public.generate_next_daily_token;
  DROP FUNCTION IF EXISTS public.generate_next_visit_number;
  DROP FUNCTION IF EXISTS public.generate_next_uhid;

  ALTER TABLE public.drugs DROP CONSTRAINT IF EXISTS drugs_stock_quantity_non_negative;
  ALTER TABLE public.doctors DROP CONSTRAINT IF EXISTS doctors_id_fkey;
  ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_patient_id_fkey;
  ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_doctor_id_fkey;
  ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_visit_id_fkey;
  ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_patient_id_fkey;
  ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
  ALTER TABLE public.prescription_items DROP CONSTRAINT IF EXISTS prescription_items_prescription_id_fkey;
  ALTER TABLE public.dispensing_items DROP CONSTRAINT IF EXISTS dispensing_items_dispensing_id_fkey;
  ALTER TABLE public.beds DROP CONSTRAINT IF EXISTS beds_ward_id_fkey;
  ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_patient_id_fkey;
  ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_bed_id_fkey;
  ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_doctor_id_fkey;
COMMIT;
*/

