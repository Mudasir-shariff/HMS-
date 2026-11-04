-- =============================================================================
-- RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
-- PERFORMANCE INDEXES & REALTIME OPTIMIZATION SCRIPT
-- =============================================================================
-- Run this script in the Supabase SQL Editor to ensure instant query performance (<10ms)
-- and seamless realtime publication across all tables.

-- 1. High-Performance Indexes for Instant Lookups and Queue Sorting
CREATE INDEX IF NOT EXISTS idx_visits_status_token ON public.visits (status, token_number);
CREATE INDEX IF NOT EXISTS idx_visits_doctor_status ON public.visits (doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON public.visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON public.visits (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id ON public.prescriptions (visit_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions (patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON public.prescriptions (doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at ON public.prescriptions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_items_rx_id ON public.prescription_items (prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_drug_id ON public.prescription_items (drug_id);

CREATE INDEX IF NOT EXISTS idx_dispensings_rx_id ON public.dispensings (prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispensings_visit_id ON public.dispensings (visit_id);
CREATE INDEX IF NOT EXISTS idx_dispensings_created_at ON public.dispensings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_uhid ON public.patients (uhid);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients (phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients (name);

CREATE INDEX IF NOT EXISTS idx_drugs_name ON public.drugs (name);
CREATE INDEX IF NOT EXISTS idx_drugs_stock ON public.drugs (stock_quantity);

-- 2. Ensure soft-delete 'deleted_at' column exists across all tables
ALTER TABLE IF EXISTS public.patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.visits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.prescription_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.drugs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispensings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispensing_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.user_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.doctors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.beds ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.admissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.wards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.hospital_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.lab_test_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Set REPLICA IDENTITY FULL for zero-payload-loss Realtime events
ALTER TABLE IF EXISTS public.visits REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.patients REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.prescriptions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.prescription_items REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.dispensings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.dispensing_items REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.drugs REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.doctors REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.beds REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.admissions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.wards REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.hospital_settings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.lab_test_orders REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.user_profiles REPLICA IDENTITY FULL;

-- 4. Ensure all tables are part of the supabase_realtime publication
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.visits; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.patients; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.prescriptions; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.prescription_items; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dispensings; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dispensing_items; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.drugs; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.beds; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.admissions; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wards; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_settings; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_test_orders; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles; EXCEPTION WHEN duplicate_object THEN END;
END $$;

SELECT 'HMS Realtime & Performance Optimization Indexes successfully applied!' AS status;
