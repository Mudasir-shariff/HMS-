# RADHAKRISHNA HOSPITAL MANAGEMENT SYSTEM
## Database Backup, PITR & Disaster Recovery Runbook

### 1. Overview
The Radhakrishna Hospital database contains mission-critical electronic health records (EHR), OPD consultation tokens, prescriptions, dispensing logs, and IP billing histories. To ensure 99.99% data durability and regulatory compliance, the system employs **Continuous Archiving with Point-In-Time Recovery (PITR)** on Supabase Postgres.

---

### 2. Enabling Point-in-Time Recovery (PITR)
1. Open the [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Project Settings** -> **Database** -> **Backups**.
3. Under **Point-in-Time Recovery**, click **Enable PITR**.
4. Configure retention window to **7 days** (or 30 days on Enterprise tier).
5. Supabase automatically streams Write-Ahead Logs (WAL) continuously to encrypted off-site object storage.

---

### 3. Automated Daily Physical Snapshots
In addition to PITR, Supabase executes daily base backups:
- **Frequency:** Every 24 hours (02:00 AM IST off-peak).
- **Format:** Full Postgres physical image.
- **Verification:** Weekly automated restore test into isolated test container.

---

### 4. Step-by-Step Restoration Procedure

#### Scenario A: Point-in-Time Restoration (Accidental deletion or data corruption)
1. Determine the target timestamp `T` (e.g. `2026-11-03 14:15:00 UTC`), exactly 1 minute prior to the corruption incident.
2. Go to **Database** -> **Backups** -> **Point in Time**.
3. Select **Restore to a specific point in time**.
4. Enter target timestamp:
   ```text
   Timestamp: 2026-11-03T08:45:00.000Z
   ```
5. Click **Confirm Restore to New Project** (Recommended) or **Restore to Existing**.
6. Verify record counts on tables:
   ```sql
   SELECT 'patients', count(*) FROM public.patients
   UNION ALL
   SELECT 'visits', count(*) FROM public.visits
   UNION ALL
   SELECT 'prescriptions', count(*) FROM public.prescriptions
   UNION ALL
   SELECT 'dispensings', count(*) FROM public.dispensings;
   ```
7. Update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in production environment settings.

#### Scenario B: Manual Logical Backup via CLI
To take an ad-hoc local snapshot before major migrations:
```bash
# Dump complete schema and data
pg_dump "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres" \
  --schema=public \
  --format=custom \
  --file=hms_backup_$(date +%Y%m%d_%H%M%S).dump

# Restore dump into clean database
pg_restore -d "postgresql://postgres:[YOUR-PASSWORD]@[TARGET-HOST]:5432/postgres" \
  --clean --if-exists --no-owner --no-privileges \
  hms_backup_20261103.dump
```

---

### 5. Audit Log Inspection
All modifications and deletions are tracked in `public.audit_logs`.
To inspect changes made to any specific record:
```sql
SELECT action, table_name, record_id, old_values, new_values, created_at
FROM public.audit_logs
WHERE table_name = 'visits' AND record_id = '<VISIT_UUID>'
ORDER BY created_at DESC;
```

