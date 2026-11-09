-- ============================================================================
-- MIGRATION: REMOVE PHARMACY MODULE COMPLETELY
-- Drops all pharmacy tables, functions, indexes, and realtime publications
-- ============================================================================

-- 1. Remove realtime publication bindings
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.dispensing_items;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.dispensings;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.drugs;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- 2. Drop atomic dispensing RPC function
DROP FUNCTION IF EXISTS public.dispense_prescription_atomic(UUID, UUID, UUID, TEXT, JSONB);

-- 3. Drop pharmacy indexes
DROP INDEX IF EXISTS public.idx_drugs_name;
DROP INDEX IF EXISTS public.idx_drugs_stock;
DROP INDEX IF EXISTS public.idx_dispensings_rx_id;
DROP INDEX IF EXISTS public.idx_dispensings_patient_id;
DROP INDEX IF EXISTS public.idx_dispensings_created_at;

-- 4. Drop pharmacy tables (CASCADE drops any foreign keys)
DROP TABLE IF EXISTS public.dispensing_items CASCADE;
DROP TABLE IF EXISTS public.dispensings CASCADE;
DROP TABLE IF EXISTS public.drugs CASCADE;

-- 5. Migrate any existing visits currently in 'prescribed' or 'dispensed' to 'completed'
UPDATE public.visits
SET status = 'completed', updated_at = NOW()
WHERE status IN ('prescribed', 'dispensed');

-- 6. Remove any user accounts with role = 'pharmacist'
DELETE FROM public.user_profiles WHERE role = 'pharmacist';
DELETE FROM public.users WHERE role = 'pharmacist';

-- 7. Audit log note for traceability
INSERT INTO public.audit_logs (
  id, action, entity_type, record_id, details, created_at
) VALUES (
  gen_random_uuid(),
  'DELETE',
  'system_module',
  'pharmacy',
  'Pharmacy codebase & database module removed. All active prescription visits migrated to completed.',
  NOW()
);
