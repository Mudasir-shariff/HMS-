-- ============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- Script: Completely Disable Row Level Security (RLS) on all tables
-- ============================================================================
-- Execute in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Disable Row Level Security on all application tables
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

-- 2. Grant full CRUD permissions to anon, authenticated, and service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure future tables also inherit full permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
