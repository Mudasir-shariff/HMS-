import { generateUUID } from '../utils/quantity';
import type { AuditLog, UserAccount } from '../types/database';
import { pushAuditLogToSupabase } from '../supabase/sync';

const AUDIT_STORAGE_KEY = 'hms_audit_logs';

/**
 * Retrieves cached audit logs from local storage.
 */
export function getLocalAuditLogs(): AuditLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves audit logs to local storage.
 */
export function saveLocalAuditLogs(logs: AuditLog[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, 1000)));
  } catch (err) {
    console.warn('Failed to persist audit logs locally:', err);
  }
}

export interface RecordAuditLogInput {
  action: string;
  tableName?: string;
  table_name?: string;
  entity_type?: string;
  recordId?: string;
  record_id?: string;
  entity_id?: string;
  details: string;
  oldData?: any;
  old_data?: any;
  newData?: any;
  new_data?: any;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  actor?: Partial<UserAccount>;
}

/**
 * Records an immutable audit log entry for compliance, accountability, and security tracking.
 */
export function recordAuditLog(entry: RecordAuditLogInput): AuditLog {
  const table = entry.table_name || entry.tableName || entry.entity_type || 'general';
  const recId = entry.record_id || entry.recordId || entry.entity_id;
  const oldVal = entry.old_data || entry.oldData;
  const newVal = entry.new_data || entry.newData;

  let actorName = entry.user_name || entry.actor?.full_name;
  let actorId = entry.user_id || entry.actor?.id;
  let actorRole = entry.user_role || entry.actor?.role;

  if (typeof window !== 'undefined' && (!actorName || !actorId)) {
    try {
      const userStr = localStorage.getItem('hms_current_user') || localStorage.getItem('hms_auth');
      if (userStr) {
        const u = JSON.parse(userStr);
        actorName = actorName || u.full_name || u.name;
        actorId = actorId || u.id;
        actorRole = actorRole || u.role;
      }
    } catch {}
  }

  const log: AuditLog = {
    id: generateUUID(),
    table_name: table,
    record_id: recId,
    entity_type: table,
    entity_id: recId,
    action: entry.action,
    user_id: actorId,
    user_name: actorName || 'System Admin',
    user_role: actorRole || 'admin',
    details: entry.details,
    old_data: oldVal,
    new_data: newVal,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    const existing = getLocalAuditLogs();
    saveLocalAuditLogs([log, ...existing]);
  }

  // Push to Supabase in background
  pushAuditLogToSupabase(log).catch(() => {});

  return log;
}
