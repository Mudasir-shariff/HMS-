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

-- 3. Disable Row Level Security (RLS) on all tables & Grant Permissions
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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

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

