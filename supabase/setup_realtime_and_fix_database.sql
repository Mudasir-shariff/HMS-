-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- Setup Realtime Replication, Unify Staff & Doctor Profiles, Remove Constraints
-- =============================================================================
-- Execute this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- =============================================================================

-- 1. Support Injections & Nullable drug_id for Custom Items
DO $$ BEGIN
  ALTER TYPE public.drug_type ADD VALUE IF NOT EXISTS 'injection';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.prescription_items ALTER COLUMN drug_id DROP NOT NULL;

-- 2. Drop restrictive foreign key constraints so registrations, visits & prescriptions never fail
ALTER TABLE IF EXISTS public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
ALTER TABLE IF EXISTS public.doctors DROP CONSTRAINT IF EXISTS doctors_user_id_fkey;
ALTER TABLE IF EXISTS public.visits DROP CONSTRAINT IF EXISTS visits_doctor_id_fkey;
ALTER TABLE IF EXISTS public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
ALTER TABLE IF EXISTS public.admissions DROP CONSTRAINT IF EXISTS admissions_doctor_id_fkey;

-- 3. Extend user_profiles with full staff details for seamless sync across all devices
ALTER TABLE IF EXISTS public.user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS specialization TEXT,
  ADD COLUMN IF NOT EXISTS consultation_room TEXT,
  ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC DEFAULT 500,
  ADD COLUMN IF NOT EXISTS opd_timings TEXT;

-- 4. Automatic User & Doctor Provisioning Trigger from auth.users (Security Definer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := 'receptionist';
  v_full_name text;
  v_phone text;
  v_spec text;
  v_room text;
  v_fee numeric := 500;
  v_timings text;
BEGIN
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_phone := new.raw_user_meta_data->>'phone';
  v_spec := new.raw_user_meta_data->>'specialization';
  v_room := new.raw_user_meta_data->>'consultation_room';
  v_timings := new.raw_user_meta_data->>'opd_timings';
  
  IF (new.raw_user_meta_data->>'consultation_fee') IS NOT NULL AND (new.raw_user_meta_data->>'consultation_fee') != '' THEN
    BEGIN
      v_fee := (new.raw_user_meta_data->>'consultation_fee')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_fee := 500;
    END;
  END IF;

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

  -- Upsert into user_profiles with full details
  INSERT INTO public.user_profiles (
    id, email, full_name, role, phone, is_active,
    specialization, consultation_room, consultation_fee, opd_timings
  )
  VALUES (
    new.id, LOWER(new.email), v_full_name, v_role, v_phone, true,
    v_spec, v_room, v_fee, v_timings
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, user_profiles.email),
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        phone = COALESCE(EXCLUDED.phone, user_profiles.phone),
        specialization = COALESCE(EXCLUDED.specialization, user_profiles.specialization),
        consultation_room = COALESCE(EXCLUDED.consultation_room, user_profiles.consultation_room),
        consultation_fee = COALESCE(EXCLUDED.consultation_fee, user_profiles.consultation_fee),
        opd_timings = COALESCE(EXCLUDED.opd_timings, user_profiles.opd_timings);

  -- If doctor, automatically upsert doctor row with id = new.id (matching user_id)
  IF v_role = 'doctor' THEN
    INSERT INTO public.doctors (id, user_id, specialization, consultation_room, is_available)
    VALUES (new.id, new.id, COALESCE(v_spec, 'General Medicine'), COALESCE(v_room, 'Room 1'), true)
    ON CONFLICT (user_id) DO UPDATE
      SET id = EXCLUDED.id,
          specialization = EXCLUDED.specialization,
          consultation_room = EXCLUDED.consultation_room;
  END IF;

  RETURN new;
END;
$$;

-- Trigger whenever user registers or updates in Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Backfill all existing registered auth users into user_profiles and doctors
INSERT INTO public.user_profiles (
  id, email, full_name, role, phone, is_active,
  specialization, consultation_room, consultation_fee, opd_timings
)
SELECT
  id,
  LOWER(email),
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  CASE 
    WHEN LOWER(COALESCE(raw_user_meta_data->>'role', '')) = 'doctor' THEN 'doctor'::user_role
    WHEN LOWER(COALESCE(raw_user_meta_data->>'role', '')) IN ('admin', 'super_admin', 'super admin') THEN 'admin'::user_role
    WHEN LOWER(COALESCE(raw_user_meta_data->>'role', '')) = 'pharmacist' THEN 'pharmacist'::user_role
    ELSE 'receptionist'::user_role
  END,
  raw_user_meta_data->>'phone',
  true,
  raw_user_meta_data->>'specialization',
  raw_user_meta_data->>'consultation_room',
  500,
  raw_user_meta_data->>'opd_timings'
FROM auth.users
ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, user_profiles.email),
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      phone = COALESCE(EXCLUDED.phone, user_profiles.phone),
      specialization = COALESCE(EXCLUDED.specialization, user_profiles.specialization),
      consultation_room = COALESCE(EXCLUDED.consultation_room, user_profiles.consultation_room);

-- Ensure doctor rows exist for all doctors in user_profiles
INSERT INTO public.doctors (id, user_id, specialization, consultation_room, is_available)
SELECT
  id,
  id,
  COALESCE(specialization, 'General Medicine'),
  COALESCE(consultation_room, 'Room 1'),
  true
FROM public.user_profiles
WHERE role = 'doctor'
ON CONFLICT (user_id) DO UPDATE
  SET id = EXCLUDED.id,
      specialization = EXCLUDED.specialization,
      consultation_room = EXCLUDED.consultation_room;

UPDATE public.doctors SET id = user_id WHERE id != user_id;

-- 6. Completely Disable Row Level Security (RLS) on all application tables
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

-- 7. Grant full CRUD permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 8. ENABLE REALTIME BROADCASTING FOR ALL TABLES
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

ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.doctors REPLICA IDENTITY FULL;
ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER TABLE public.prescriptions REPLICA IDENTITY FULL;
ALTER TABLE public.prescription_items REPLICA IDENTITY FULL;
ALTER TABLE public.drugs REPLICA IDENTITY FULL;
ALTER TABLE public.dispensings REPLICA IDENTITY FULL;
ALTER TABLE public.dispensing_items REPLICA IDENTITY FULL;
ALTER TABLE public.hospital_settings REPLICA IDENTITY FULL;
ALTER TABLE public.wards REPLICA IDENTITY FULL;
ALTER TABLE public.beds REPLICA IDENTITY FULL;
ALTER TABLE public.admissions REPLICA IDENTITY FULL;

-- 9. Seed default settings, wards and beds if not present
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
