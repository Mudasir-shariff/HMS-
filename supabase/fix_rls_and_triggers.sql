-- ============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- Supabase Production Fix: Triggers, Backfill & Row Level Security (RLS)
-- ============================================================================
-- RUN THIS IN YOUR SUPABASE SQL EDITOR (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Automatic User & Doctor Provisioning Trigger from auth.users
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

-- 2. Immediate Backfill of Existing Registered Users in auth.users
INSERT INTO public.user_profiles (id, full_name, role, phone, is_active)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  CASE 
    WHEN LOWER(COALESCE(raw_user_meta_data->>'role', '')) = 'doctor' THEN 'doctor'::user_role
    WHEN LOWER(COALESCE(raw_user_meta_data->>'role', '')) IN ('admin', 'super_admin', 'super admin') THEN 'admin'::user_role
    WHEN LOWER(COALESCE(raw_user_meta_data->>'role', '')) = 'pharmacist' THEN 'pharmacist'::user_role
    ELSE 'receptionist'::user_role
  END,
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
WHERE LOWER(COALESCE(raw_user_meta_data->>'role', '')) = 'doctor'
ON CONFLICT (user_id) DO NOTHING;

-- 3. Row Level Security (RLS) Permissive Policies for Hospital Web App
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

-- Profiles: allow reading and writing
DROP POLICY IF EXISTS "profiles_read_all" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_write_all" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.user_profiles;
CREATE POLICY "profiles_read_all"  ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_write_all" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);

-- Doctors: allow reading and writing
DROP POLICY IF EXISTS "doctors_read_all" ON public.doctors;
DROP POLICY IF EXISTS "doctors_write_all" ON public.doctors;
DROP POLICY IF EXISTS "doctors_read" ON public.doctors;
DROP POLICY IF EXISTS "doctors_write" ON public.doctors;
CREATE POLICY "doctors_read_all"  ON public.doctors FOR SELECT USING (true);
CREATE POLICY "doctors_write_all" ON public.doctors FOR ALL USING (true) WITH CHECK (true);

-- Settings: allow reading and writing
DROP POLICY IF EXISTS "settings_read_all" ON public.hospital_settings;
DROP POLICY IF EXISTS "settings_write_all" ON public.hospital_settings;
DROP POLICY IF EXISTS "settings_read" ON public.hospital_settings;
DROP POLICY IF EXISTS "settings_write" ON public.hospital_settings;
CREATE POLICY "settings_read_all"  ON public.hospital_settings FOR SELECT USING (true);
CREATE POLICY "settings_write_all" ON public.hospital_settings FOR ALL USING (true) WITH CHECK (true);

-- Patients: allow reading and writing
DROP POLICY IF EXISTS "patients_all" ON public.patients;
DROP POLICY IF EXISTS "patients_read_all" ON public.patients;
DROP POLICY IF EXISTS "patients_write" ON public.patients;
DROP POLICY IF EXISTS "patients_update" ON public.patients;
CREATE POLICY "patients_all" ON public.patients FOR ALL USING (true) WITH CHECK (true);

-- Visits: allow reading and writing
DROP POLICY IF EXISTS "visits_all" ON public.visits;
DROP POLICY IF EXISTS "visits_read" ON public.visits;
DROP POLICY IF EXISTS "visits_insert" ON public.visits;
DROP POLICY IF EXISTS "visits_update" ON public.visits;
CREATE POLICY "visits_all" ON public.visits FOR ALL USING (true) WITH CHECK (true);

-- Prescriptions: allow reading and writing
DROP POLICY IF EXISTS "rx_all" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_items_all" ON public.prescription_items;
DROP POLICY IF EXISTS "rx_read" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_write" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_update" ON public.prescriptions;
DROP POLICY IF EXISTS "rx_items_read" ON public.prescription_items;
DROP POLICY IF EXISTS "rx_items_write" ON public.prescription_items;
CREATE POLICY "rx_all" ON public.prescriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rx_items_all" ON public.prescription_items FOR ALL USING (true) WITH CHECK (true);

-- Lab Orders
DROP POLICY IF EXISTS "lab_all" ON public.lab_test_orders;
DROP POLICY IF EXISTS "lab_read" ON public.lab_test_orders;
DROP POLICY IF EXISTS "lab_write" ON public.lab_test_orders;
CREATE POLICY "lab_all" ON public.lab_test_orders FOR ALL USING (true) WITH CHECK (true);

-- Drugs
DROP POLICY IF EXISTS "drugs_all" ON public.drugs;
DROP POLICY IF EXISTS "drugs_read" ON public.drugs;
DROP POLICY IF EXISTS "drugs_write" ON public.drugs;
CREATE POLICY "drugs_all" ON public.drugs FOR ALL USING (true) WITH CHECK (true);

-- Dispensings
DROP POLICY IF EXISTS "disp_all" ON public.dispensings;
DROP POLICY IF EXISTS "disp_items_all" ON public.dispensing_items;
DROP POLICY IF EXISTS "disp_read" ON public.dispensings;
DROP POLICY IF EXISTS "disp_write" ON public.dispensings;
CREATE POLICY "disp_all" ON public.dispensings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "disp_items_all" ON public.dispensing_items FOR ALL USING (true) WITH CHECK (true);

-- In-Patient: Wards, Beds & Admissions
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

-- Audit
DROP POLICY IF EXISTS "audit_all" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_read" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_all" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- 4. Seed Hospital Settings & Wards / Beds
INSERT INTO public.hospital_settings (hospital_name, address, phone)
  VALUES ('RADHAKRISHNA HOSPITAL', 'Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka', '+91 8154 252222')
  ON CONFLICT DO NOTHING;

INSERT INTO public.wards (id, name, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'General Ward Male', true),
  ('a0000000-0000-0000-0000-000000000002', 'General Ward Female', true),
  ('a0000000-0000-0000-0000-000000000003', 'ICU & Critical Care', true),
  ('a0000000-0000-0000-0000-000000000004', 'Private Deluxe Suite', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.beds (id, ward_id, bed_number, price_per_day, is_occupied) VALUES
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'Bed 101', 1200, false),
  ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', 'Bed 102', 1200, false),
  ('b0000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000001', 'Bed 103', 1200, false),
  ('b0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000002', 'Bed 201', 1200, false),
  ('b0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000002', 'Bed 202', 1200, false),
  ('b0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000003', 'ICU Bed 1', 4500, false),
  ('b0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000004', 'Suite 401', 3500, false)
  ON CONFLICT (id) DO NOTHING;

