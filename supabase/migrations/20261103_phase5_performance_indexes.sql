-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- PHASE 5 MIGRATION: Performance Indexes & Query Optimization
-- =============================================================================

BEGIN;

-- Ensure deleted_at exists before creating partial indexes
ALTER TABLE IF EXISTS public.patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.visits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.drugs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.admissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 1. Visits: Fast lookup by doctor, status, and creation date
CREATE INDEX IF NOT EXISTS idx_visits_doctor_status_date
  ON public.visits (doctor_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- 2. Visits: Fast lookup by patient
CREATE INDEX IF NOT EXISTS idx_visits_patient_id
  ON public.visits (patient_id, created_at DESC);

-- 3. Patients: Fast lookup by phone number (10 digits)
CREATE INDEX IF NOT EXISTS idx_patients_phone
  ON public.patients (phone)
  WHERE deleted_at IS NULL;

-- 4. Patients: Fast lookup by UHID
CREATE INDEX IF NOT EXISTS idx_patients_uhid
  ON public.patients (uhid)
  WHERE deleted_at IS NULL;

-- 5. Prescriptions: Fast lookup by visit_id
CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id
  ON public.prescriptions (visit_id)
  WHERE deleted_at IS NULL;

-- 6. Prescription Items: Fast lookup by prescription_id
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription_id
  ON public.prescription_items (prescription_id);

-- 7. Drugs: Fast lookup by name for search autocomplete
CREATE INDEX IF NOT EXISTS idx_drugs_name_trgm
  ON public.drugs (name, is_active)
  WHERE deleted_at IS NULL;

-- 8. Dispensings: Fast lookup by creation date for analytics
CREATE INDEX IF NOT EXISTS idx_dispensings_created_at
  ON public.dispensings (created_at DESC);

-- 9. Admissions: Fast lookup by active status & patient
CREATE INDEX IF NOT EXISTS idx_admissions_patient_status
  ON public.admissions (patient_id, status)
  WHERE deleted_at IS NULL;

-- 10. Audit Logs: Fast query by table_name & record_id
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
  ON public.audit_logs (table_name, record_id, created_at DESC);

COMMIT;

/*
-- =============================================================================
-- ROLLBACK SCRIPT FOR PHASE 5
-- =============================================================================
BEGIN;
  DROP INDEX IF EXISTS public.idx_visits_doctor_status_date;
  DROP INDEX IF EXISTS public.idx_visits_patient_id;
  DROP INDEX IF EXISTS public.idx_patients_phone;
  DROP INDEX IF EXISTS public.idx_patients_uhid;
  DROP INDEX IF EXISTS public.idx_prescriptions_visit_id;
  DROP INDEX IF EXISTS public.idx_prescription_items_prescription_id;
  DROP INDEX IF EXISTS public.idx_drugs_name_trgm;
  DROP INDEX IF EXISTS public.idx_dispensings_created_at;
  DROP INDEX IF EXISTS public.idx_admissions_patient_status;
  DROP INDEX IF EXISTS public.idx_audit_logs_table_record;
COMMIT;
*/

