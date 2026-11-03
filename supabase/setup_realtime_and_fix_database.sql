-- ============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- Setup Realtime Replication, Unify Doctor IDs & Remove All Constraint Blocks
-- ============================================================================
-- Execute this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Support Injections & Nullable drug_id for Custom Items
DO $$ BEGIN
  ALTER TYPE public.drug_type ADD VALUE IF NOT EXISTS 'injection';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.prescription_items ALTER COLUMN drug_id DROP NOT NULL;

-- 2. Drop restrictive foreign key constraints on doctor_id so visits & prescriptions never fail
ALTER TABLE IF EXISTS public.visits DROP CONSTRAINT IF EXISTS visits_doctor_id_fkey;
ALTER TABLE IF EXISTS public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
ALTER TABLE IF EXISTS public.admissions DROP CONSTRAINT IF EXISTS admissions_doctor_id_fkey;

-- 3. Automatic User & Doctor Provisioning Trigger from auth.users
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
    CASE LOWER(new.raw_user_meta_data->>'role')
      WHEN 'doctor' THEN v_role := 'doctor';
      WHEN 'admin' THEN v_role := 'admin';
      WHEN 'super_admin' THEN v_role := 'admin';
      WHEN 'super admin' THEN v_role := 'admin';
      WHEN 'pharmacist' THEN v_role := 'pharmacist';
      ELSE v_role := 'receptionist';
    END CASE;
  END IF;

  -- Upsert into user_profiles
  INSERT INTO public.user_profiles (id, full_name, role, phone, is_active)
  VALUES (new.id, v_full_name, v_role, v_phone, true)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        phone = COALESCE(EXCLUDED.phone, user_profiles.phone);

  -- If doctor, upsert doctor profile with id = new.id (matching user_id)
  IF v_role = 'doctor' THEN
    INSERT INTO public.doctors (id, user_id, specialization, consultation_room, is_available)
    VALUES (new.id, new.id, COALESCE(v_spec, 'General Medicine'), COALESCE(v_room, 'Room 1'), true)
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

-- 4. Backfill all existing registered auth users into user_profiles and doctors
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

INSERT INTO public.doctors (id, user_id, specialization, consultation_room, is_available)
SELECT
  id,
  id,
  COALESCE(raw_user_meta_data->>'specialization', 'General Medicine'),
  COALESCE(raw_user_meta_data->>'consultation_room', 'Room 1'),
  true
FROM auth.users
WHERE LOWER(COALESCE(raw_user_meta_data->>'role', '')) = 'doctor'
ON CONFLICT (user_id) DO UPDATE
  SET id = EXCLUDED.id;

-- Ensure all existing doctors have id = user_id
UPDATE public.doctors SET id = user_id WHERE id != user_id;

-- 5. Completely Disable Row Level Security (RLS) on all application tables
ALTER TABLE IF EXISTS public.user_profiles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.doctors            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patients           DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visits             DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prescriptions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prescription_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lab_test_orders    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.drugs              DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dispensings        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dispensing_items   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wards              DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.beds               DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admissions         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hospital_settings  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs         DISABLE ROW LEVEL SECURITY;

-- 6. Grant full CRUD permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 7. ENABLE REALTIME BROADCASTING FOR ALL TABLES
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE 
    public.user_profiles,
    public.doctors,
    public.patients,
    public.visits,
    public.prescriptions,
    public.prescription_items,
    public.drugs,
    public.dispensings,
    public.dispensing_items,
    public.hospital_settings,
    public.wards,
    public.beds,
    public.admissions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER TABLE public.prescriptions REPLICA IDENTITY FULL;
ALTER TABLE public.prescription_items REPLICA IDENTITY FULL;
ALTER TABLE public.drugs REPLICA IDENTITY FULL;
ALTER TABLE public.dispensings REPLICA IDENTITY FULL;
ALTER TABLE public.dispensing_items REPLICA IDENTITY FULL;
ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.doctors REPLICA IDENTITY FULL;
ALTER TABLE public.hospital_settings REPLICA IDENTITY FULL;
ALTER TABLE public.wards REPLICA IDENTITY FULL;
ALTER TABLE public.beds REPLICA IDENTITY FULL;
ALTER TABLE public.admissions REPLICA IDENTITY FULL;

-- 8. Seed default settings, wards and beds if not present
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
