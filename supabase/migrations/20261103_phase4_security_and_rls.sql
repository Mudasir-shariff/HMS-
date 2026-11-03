-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- PHASE 4 MIGRATION: Security Hardening, Remove Plaintext Passwords,
--                    Role-Based Row Level Security (RLS) on all 15 Tables
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENSURE deleted_at COLUMNS EXIST & REMOVE PLAINTEXT PASSWORDS
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.visits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescription_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.lab_test_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.drugs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispensings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispensing_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.wards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.beds ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.admissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.hospital_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.user_profiles DROP COLUMN IF EXISTS password;

-- -----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL (RBAC)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role() = 'admin'::public.user_role, FALSE);
$$;

-- -----------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. POLICIES: user_profiles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_profiles_select_authenticated" ON public.user_profiles;
CREATE POLICY "user_profiles_select_authenticated"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "user_profiles_update_self_or_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_update_self_or_admin"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "user_profiles_admin_all" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_all"
  ON public.user_profiles FOR ALL
  TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. POLICIES: doctors
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "doctors_select_all" ON public.doctors;
CREATE POLICY "doctors_select_all"
  ON public.doctors FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "doctors_update_self_or_admin" ON public.doctors;
CREATE POLICY "doctors_update_self_or_admin"
  ON public.doctors FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. POLICIES: patients
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "patients_select_authenticated" ON public.patients;
CREATE POLICY "patients_select_authenticated"
  ON public.patients FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "patients_insert_staff" ON public.patients;
CREATE POLICY "patients_insert_staff"
  ON public.patients FOR INSERT
  TO authenticated
  WITH CHECK (public.get_current_user_role() IN ('admin', 'receptionist', 'doctor'));

DROP POLICY IF EXISTS "patients_update_staff" ON public.patients;
CREATE POLICY "patients_update_staff"
  ON public.patients FOR UPDATE
  TO authenticated
  USING (public.get_current_user_role() IN ('admin', 'receptionist', 'doctor'));

-- -----------------------------------------------------------------------------
-- 7. POLICIES: visits
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "visits_select_scoped" ON public.visits;
CREATE POLICY "visits_select_scoped"
  ON public.visits FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.get_current_user_role() IN ('admin', 'receptionist', 'pharmacist')
      OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "visits_insert_reception_or_admin" ON public.visits;
CREATE POLICY "visits_insert_reception_or_admin"
  ON public.visits FOR INSERT
  TO authenticated
  WITH CHECK (public.get_current_user_role() IN ('admin', 'receptionist'));

DROP POLICY IF EXISTS "visits_update_staff" ON public.visits;
CREATE POLICY "visits_update_staff"
  ON public.visits FOR UPDATE
  TO authenticated
  USING (
    public.get_current_user_role() IN ('admin', 'receptionist', 'pharmacist')
    OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 8. POLICIES: prescriptions & prescription_items
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "prescriptions_select_all" ON public.prescriptions;
CREATE POLICY "prescriptions_select_all"
  ON public.prescriptions FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "prescriptions_insert_doctor_or_admin" ON public.prescriptions;
CREATE POLICY "prescriptions_insert_doctor_or_admin"
  ON public.prescriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
  );

DROP POLICY IF EXISTS "prescriptions_update_doctor_or_admin" ON public.prescriptions;
CREATE POLICY "prescriptions_update_doctor_or_admin"
  ON public.prescriptions FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.get_current_user_role() = 'doctor' AND doctor_id = auth.uid())
    OR public.get_current_user_role() = 'pharmacist'
  );

DROP POLICY IF EXISTS "prescription_items_select" ON public.prescription_items;
CREATE POLICY "prescription_items_select"
  ON public.prescription_items FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "prescription_items_write" ON public.prescription_items;
CREATE POLICY "prescription_items_write"
  ON public.prescription_items FOR ALL
  TO authenticated
  USING (public.get_current_user_role() IN ('doctor', 'pharmacist', 'admin'));

-- -----------------------------------------------------------------------------
-- 9. POLICIES: drugs
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "drugs_select_authenticated" ON public.drugs;
CREATE POLICY "drugs_select_authenticated"
  ON public.drugs FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "drugs_modify_pharmacist_or_admin" ON public.drugs;
CREATE POLICY "drugs_modify_pharmacist_or_admin"
  ON public.drugs FOR ALL
  TO authenticated
  USING (public.get_current_user_role() IN ('pharmacist', 'admin'));

-- -----------------------------------------------------------------------------
-- 10. POLICIES: dispensings & dispensing_items
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "dispensings_select_authenticated" ON public.dispensings;
CREATE POLICY "dispensings_select_authenticated"
  ON public.dispensings FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "dispensings_modify_pharmacist_or_admin" ON public.dispensings;
CREATE POLICY "dispensings_modify_pharmacist_or_admin"
  ON public.dispensings FOR ALL
  TO authenticated
  USING (public.get_current_user_role() IN ('pharmacist', 'admin'));

DROP POLICY IF EXISTS "dispensing_items_all" ON public.dispensing_items;
CREATE POLICY "dispensing_items_all"
  ON public.dispensing_items FOR ALL
  TO authenticated
  USING (TRUE);

-- -----------------------------------------------------------------------------
-- 11. POLICIES: wards, beds, admissions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "wards_select" ON public.wards;
CREATE POLICY "wards_select" ON public.wards FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "wards_modify" ON public.wards;
CREATE POLICY "wards_modify" ON public.wards FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "beds_select" ON public.beds;
CREATE POLICY "beds_select" ON public.beds FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "beds_modify" ON public.beds;
CREATE POLICY "beds_modify" ON public.beds FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admissions_select" ON public.admissions;
CREATE POLICY "admissions_select" ON public.admissions FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "admissions_modify" ON public.admissions;
CREATE POLICY "admissions_modify" ON public.admissions FOR ALL TO authenticated
  USING (public.get_current_user_role() IN ('receptionist', 'admin', 'doctor'));

-- -----------------------------------------------------------------------------
-- 12. POLICIES: hospital_settings
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "settings_select" ON public.hospital_settings;
CREATE POLICY "settings_select" ON public.hospital_settings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "settings_modify" ON public.hospital_settings;
CREATE POLICY "settings_modify" ON public.hospital_settings FOR ALL TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 13. POLICIES: audit_logs (Strictly Admin Read Only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());

COMMIT;

/*
-- =============================================================================
-- ROLLBACK SCRIPT FOR PHASE 4
-- =============================================================================
BEGIN;
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

  DROP FUNCTION IF EXISTS public.is_admin();
  DROP FUNCTION IF EXISTS public.get_current_user_role();
COMMIT;
*/

