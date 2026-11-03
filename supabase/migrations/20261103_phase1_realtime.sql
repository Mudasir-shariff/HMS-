-- ============================================================================
-- MIGRATION: Phase 1 — Enable Supabase Realtime Replication & Full Replica Identity
-- Migration Date: 2026-11-03
-- ============================================================================
-- PURPOSE:
-- 1. Ensure all core hospital tables broadcast postgres_changes via WebSockets.
-- 2. Configure REPLICA IDENTITY FULL so UPDATE and DELETE payloads contain the
--    complete previous row (old record), allowing client cache eviction without
--    secondary round-trip fetches.
-- ============================================================================

-- Step 1: Add all application tables to supabase_realtime publication
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

-- Step 2: Set REPLICA IDENTITY FULL on all tables needing complete payload on updates/deletes
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

-- ============================================================================
-- ROLLBACK INSTRUCTIONS:
-- To revert Phase 1 Realtime publication and replica identities:
--
-- ALTER PUBLICATION supabase_realtime DROP TABLE 
--   public.user_profiles, public.doctors, public.patients, public.visits,
--   public.prescriptions, public.prescription_items, public.drugs,
--   public.dispensings, public.dispensing_items, public.hospital_settings,
--   public.wards, public.beds, public.admissions;
--
-- ALTER TABLE public.user_profiles REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.doctors REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.patients REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.visits REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.prescriptions REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.prescription_items REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.drugs REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.dispensings REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.dispensing_items REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.hospital_settings REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.wards REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.beds REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.admissions REPLICA IDENTITY DEFAULT;
-- ============================================================================

