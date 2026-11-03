# RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
## Production Deployment & Pre-Flight Checklist

### 1. Environment & Secrets
- [ ] Separate Supabase projects created for **Development**, **Staging**, and **Production**.
- [ ] Production environment variables configured in hosting platform (Vercel / AWS / Docker):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (Server-only secret, never leaked into client bundles)
  - `NODE_ENV=production`
- [ ] No `.env.local` or service role keys present in git repository history.

### 2. Database Migrations Execution Order (Supabase SQL Editor)
Run the migration scripts in sequential order:
1. `supabase/migrations/20261103_phase1_realtime.sql`
   - Configures `supabase_realtime` publication on all 13 core tables.
   - Sets `REPLICA IDENTITY FULL` for rich old/new payloads on UPDATE/DELETE.
2. `supabase/migrations/20261103_phase2_concurrency_and_constraints.sql`
   - Unifies canonical doctor keys (`doctors.id = user_profiles.id`).
   - Creates sequences `uhid_seq` and `opd_visit_seq`.
   - Adds advisory-locked daily token function `generate_next_daily_token()`.
   - Deploys transactional atomic dispensing RPC `dispense_prescription_atomic()`.
   - Enforces `CHECK (stock_quantity >= 0)`.
   - Restores primary, foreign key (`ON DELETE CASCADE`), and unique constraints.
   - Adds optimistic concurrency (`version`) and soft deletes (`deleted_at`).
   - Deploys trigger-based `audit_logs` tracking.
3. `supabase/migrations/20261103_phase4_security_and_rls.sql`
   - Drops plaintext `password` column from `user_profiles`.
   - Enables Row Level Security (RLS) on all 15 tables.
   - Implements role-scoped policies (Doctors see only their OPD queue, Receptionists cannot edit Rx, Pharmacists restricted to stock/dispensing).
4. `supabase/migrations/20261103_phase5_performance_indexes.sql`
   - Adds composite B-Tree indexes on `visits(doctor_id, status, created_at DESC)`.
   - Adds unique indexes on `patients(phone)` and `patients(uhid)`.

### 3. Realtime & WebSocket Verification
- [ ] In Supabase Dashboard -> **Database** -> **Replication**:
  - Verify that `supabase_realtime` publication shows 13 tables selected.
- [ ] Verify SSL/WSS connectivity on hospital LAN and 4G mobile hotspots.
- [ ] Connection indicator in app top bar shows `Live · All saved` (emerald pill).

### 4. Staff Auth & Access Control
- [ ] All staff accounts registered via Supabase Auth with secure passwords.
- [ ] Password reset links sent to doctors, pharmacists, receptionists.
- [ ] Roles verified in `user_profiles` (`admin`, `doctor`, `receptionist`, `pharmacist`).

### 5. Automated CI/CD & Testing
- [ ] GitHub Actions workflow passes (`.github/workflows/ci.yml`):
  - `npx tsc --noEmit` -> 0 errors.
  - `npx eslint . --quiet` -> 0 errors.
  - `pnpm test` -> 13 passing Vitest tests.
  - `pnpm build` -> Successful Next.js production build.

