'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  Search,
  UserCheck,
  UserX,
  Stethoscope,
  Pill,
  ClipboardList,
  Users,
  RotateCcw,
  AlertTriangle,
  Check,
  X,
  Printer,
  Calendar,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, SearchInput, Avatar } from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { PageHeader } from '@/components/layout';
import {
  useUserProfiles,
  usePatients,
  useVisits,
  useDrugs,
  usePrescriptions,
  useDoctors,
  useHospitalSettings,
} from '@/lib/query/hooks';
import type { UserAccount } from '@/lib/types/database';
import {
  pushUserToSupabase,
  deleteUserFromSupabase,
  pushPatientToSupabase,
  deletePatientFromSupabase,
  deleteVisitFromSupabase,
  deleteVisitsFromSupabase,
  deletePrescriptionFromSupabase,
  deleteDrugFromSupabase,
  purgeAllRecordsFromSupabase,
} from '@/lib/supabase/sync';
import { useAuth } from '@/lib/auth/context';
import { getYearMonth, formatMonthName, isOlderThanDays } from '@/lib/utils/date';
import type { Patient, Visit, Drug, Prescription, UserRole } from '@/lib/types/database';
import { clsx } from 'clsx';

type TabId = 'staff' | 'patients' | 'visits' | 'prescriptions' | 'inventory';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'staff', label: 'Staff Logins & Accounts', icon: Users },
  { id: 'patients', label: 'All Patients Database', icon: ClipboardList },
  { id: 'visits', label: 'OPD Visits & Queue', icon: Stethoscope },
  { id: 'prescriptions', label: 'Prescriptions Master', icon: Shield },
  { id: 'inventory', label: 'Pharmacy Drug Catalog', icon: Pill },
];

const ROLE_PILL: Record<string, { variant: 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  admin: { variant: 'danger', label: 'Super Admin' },
  doctor: { variant: 'info', label: 'Doctor' },
  receptionist: { variant: 'success', label: 'Receptionist' },
  pharmacist: { variant: 'warning', label: 'Pharmacist' },
};

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: users = [] } = useUserProfiles();
  const { data: patients = [] } = usePatients();
  const { data: visits = [] } = useVisits();
  const { data: drugs = [] } = useDrugs();
  const { data: prescriptions = [] } = usePrescriptions();
  const { data: doctors = [] } = useDoctors();
  const { data: settings = { hospital_name: 'RADHAKRISHNA HOSPITAL' } as any } = useHospitalSettings();

  const [tab, setTab] = useState<TabId>('staff');
  const [search, setSearch] = useState('');

  // Monthly reporting & cleanup state
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [showMonthlyReportModal, setShowMonthlyReportModal] = useState(false);
  const [showMonthlyDeleteModal, setShowMonthlyDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'month' | 'older30'>('month');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingMonthlyData, setIsDeletingMonthlyData] = useState(false);

  // Distinct months from visits
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    visits.forEach((v) => {
      const ym = getYearMonth(v.created_at);
      if (ym) set.add(ym);
    });
    return Array.from(set).sort().reverse();
  }, [visits]);

  // Visits filtered by selected month
  const visitsForSelectedPeriod = useMemo(() => {
    if (selectedMonth === 'all') return visits;
    return visits.filter((v) => getYearMonth(v.created_at) === selectedMonth);
  }, [visits, selectedMonth]);

  // Statistics for the selected month/period
  const monthStats = useMemo(() => {
    let waiting = 0, consulting = 0, prescribed = 0, dispensed = 0;
    visitsForSelectedPeriod.forEach((v) => {
      if (v.status === 'waiting') waiting++;
      else if (v.status === 'in_consultation') consulting++;
      else if (v.status === 'prescribed') prescribed++;
      else if (v.status === 'dispensed' || v.status === 'completed') dispensed++;
    });
    return {
      total: visitsForSelectedPeriod.length,
      waiting,
      consulting,
      prescribed,
      dispensed,
    };
  }, [visitsForSelectedPeriod]);

  // Count visits older than 30 days
  const visitsOlderThan30Days = useMemo(() => {
    return visits.filter((v) => isOlderThanDays(v.created_at, 30));
  }, [visits]);

  // Modals state
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null);

  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [deletingDrugId, setDeletingDrugId] = useState<string | null>(null);
  const [deletingRxId, setDeletingRxId] = useState<string | null>(null);

  // Filtered staff
  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase()) ||
      (u.specialization && u.specialization.toLowerCase().includes(search.toLowerCase()))
  );

  // Filtered patients
  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search) ||
      p.uhid.toLowerCase().includes(search.toLowerCase())
  );

  // Filtered visits (strictly sorted by Token ascending)
  const filteredVisits = useMemo(() => {
    return visitsForSelectedPeriod
      .filter((v) => {
        const pat = patients.find((p) => p.id === v.patient_id);
        const doc = doctors.find((d) => d.id === v.doctor_id || d.user_id === v.doctor_id);
        return (
          !search ||
          (pat && pat.name.toLowerCase().includes(search.toLowerCase())) ||
          (doc && (doc.full_name || '').toLowerCase().includes(search.toLowerCase())) ||
          v.visit_number.toLowerCase().includes(search.toLowerCase())
        );
      })
      .sort((a, b) => a.token_number - b.token_number);
  }, [visitsForSelectedPeriod, search, patients, doctors]);

  // Filtered drugs
  const filteredDrugs = drugs.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.drug_type.toLowerCase().includes(search.toLowerCase())
  );

  const [isManualSyncing, setIsManualSyncing] = useState(false);

  async function handleManualSync() {
    setIsManualSyncing(true);
    await queryClient.refetchQueries();
    setIsManualSyncing(false);
  }

  // Handlers for Staff
  async function handleToggleUserActive(user: UserAccount) {
    const updated = { ...user, is_active: !user.is_active };
    await pushUserToSupabase(updated);
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });
  }

  async function handleSaveUserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    await pushUserToSupabase(editingUser);
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });
    setEditingUser(null);
  }

  async function handleDeleteUserConfirm() {
    if (!deletingUser) return;
    const uid = deletingUser.id;
    queryClient.setQueriesData<any[]>({ queryKey: queryKeys.users.all }, (old) =>
      old ? old.filter((u) => u.id !== uid) : []
    );
    queryClient.setQueriesData<any[]>({ queryKey: queryKeys.doctors.all }, (old) =>
      old ? old.filter((d) => d.id !== uid && d.user_id !== uid) : []
    );
    await deleteUserFromSupabase(uid);
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });
    setDeletingUser(null);
  }

  // Handlers for Patients
  async function handleSavePatientEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPatient) return;
    await pushPatientToSupabase(editingPatient);
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
    setEditingPatient(null);
  }

  async function handleDeletePatientConfirm() {
    if (!deletingPatient) return;
    const pid = deletingPatient.id;
    queryClient.setQueriesData<Patient[]>({ queryKey: queryKeys.patients.all }, (old) =>
      old ? old.filter((p) => p.id !== pid) : []
    );
    queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
      old ? old.filter((v) => v.patient_id !== pid) : []
    );
    await deletePatientFromSupabase(pid);
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    setDeletingPatient(null);
  }

  // Delete Visit
  async function handleDeleteVisit(v: Visit) {
    if (confirm(`Delete visit ${v.visit_number}?`)) {
      queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
        old ? old.filter((x) => x.id !== v.id) : []
      );
      await deleteVisitFromSupabase(v.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    }
  }

  // Monthly bulk delete handler
  async function handleExecuteMonthlyDelete() {
    let targetIds: string[] = [];
    if (deleteMode === 'older30') {
      targetIds = visitsOlderThan30Days.map((v) => v.id);
    } else {
      if (selectedMonth === 'all') {
        alert('Please select a specific month from the dropdown to delete monthly data.');
        return;
      }
      targetIds = visitsForSelectedPeriod.map((v) => v.id);
    }

    if (targetIds.length === 0) {
      alert('No visits found matching this deletion criterion.');
      return;
    }

    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      alert('Please type DELETE in capital letters to confirm data removal.');
      return;
    }

    setIsDeletingMonthlyData(true);
    try {
      queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
        old ? old.filter((v) => !targetIds.includes(v.id)) : []
      );
      await deleteVisitsFromSupabase(targetIds);
      await queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });
      setShowMonthlyDeleteModal(false);
      setDeleteConfirmText('');
    } catch (err) {
      console.error('Failed to delete monthly visits:', err);
      alert('Failed to delete visits from database.');
    } finally {
      setIsDeletingMonthlyData(false);
    }
  }

  // Delete Prescription
  async function handleDeleteRx(rxId: string) {
    if (confirm('Permanently delete this prescription?')) {
      queryClient.setQueriesData<Prescription[]>({ queryKey: queryKeys.prescriptions.all }, (old) =>
        old ? old.filter((x) => x.id !== rxId) : []
      );
      await deletePrescriptionFromSupabase(rxId);
      queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    }
  }

  // Delete Drug
  async function handleDeleteDrug(d: Drug) {
    if (confirm(`Delete drug ${d.name} from inventory?`)) {
      queryClient.setQueriesData<Drug[]>({ queryKey: queryKeys.drugs.all }, (old) =>
        old ? old.filter((x) => x.id !== d.id) : []
      );
      await deleteDrugFromSupabase(d.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
    }
  }

  // Purge Records
  async function handlePurgeAll() {
    if (confirm('Are you sure you want to purge all active patient queues and records? This action is permanent and cannot be undone.')) {
      queryClient.setQueriesData({ queryKey: queryKeys.patients.all }, () => []);
      queryClient.setQueriesData({ queryKey: queryKeys.visits.all }, () => []);
      queryClient.setQueriesData({ queryKey: queryKeys.prescriptions.all }, () => []);
      queryClient.setQueriesData({ queryKey: queryKeys.dispensings.all }, () => []);
      await purgeAllRecordsFromSupabase();
      queryClient.invalidateQueries();
    }
  }

  return (
    <>
      <div className={showMonthlyReportModal ? 'no-print' : ''}>
        <PageHeader
          title="Super Admin Master Control"
        subtitle="Complete hospital administration: view, edit, and delete all logins, staff, patients, visits, and data"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleManualSync}
              disabled={isManualSyncing}
              className="flex items-center gap-1.5 h-10 px-3.5 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-xs font-semibold text-[var(--green-800)] hover:bg-[var(--bg-tile)] transition-all shadow-sm"
              title="Force instant sync with Supabase cloud database"
            >
              <RotateCcw size={14} className={isManualSyncing ? 'animate-spin text-[var(--green-600)]' : ''} />
              <span>{isManualSyncing ? 'Syncing...' : 'Sync Database'}</span>
            </button>
            <button
              onClick={handlePurgeAll}
              className="flex items-center gap-1.5 h-10 px-3.5 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all"
            >
              <Trash2 size={14} />
              Purge Records & Queues
            </button>
            <Link href="/register">
              <Button icon={<Plus size={16} />}>Create Staff Account</Button>
            </Link>
          </div>
        }
      />

      {/* Hospital Stats Master Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 mb-5 sm:mb-6">
        {[
          { label: 'Staff Accounts', value: users.length, color: 'text-[var(--text-strong)]' },
          { label: 'Active Doctors', value: doctors.length, color: 'text-[var(--green-700)]' },
          { label: 'Registered Patients', value: patients.length, color: 'text-[var(--info)]' },
          { label: 'OPD Visits Total', value: visits.length, color: 'text-[var(--text-strong)]' },
          { label: 'Pharmacy Drugs', value: drugs.length, color: 'text-[#8A6520]' },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--bg-card)] rounded-[var(--r-tile)] p-3 sm:p-4 border border-[var(--line-soft)] flex flex-col justify-between min-h-[88px] sm:min-h-[96px] shadow-2xs">
            <p className={`text-2xl sm:text-3xl font-bold tabular-nums leading-tight ${s.color}`}>{s.value}</p>
            <p className="text-xs font-semibold text-[var(--text-muted)] mt-1 line-clamp-2 leading-snug">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs Header */}
      <div className="flex gap-1.5 bg-white rounded-[var(--r-pill)] p-1.5 w-full sm:w-fit shadow-[var(--shadow-float)] mb-5 sm:mb-6 overflow-x-auto no-scrollbar snap-x border border-[var(--line-soft)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSearch('');
              }}
              className={clsx(
                'flex items-center gap-2 flex-shrink-0 px-3.5 sm:px-4 py-2 rounded-[var(--r-pill)] text-xs sm:text-sm font-semibold transition-all shrink-0 min-h-[40px] snap-start touch-manipulation cursor-pointer',
                tab === t.id
                  ? 'bg-[var(--green-900)] text-white shadow-xs'
                  : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ────────────────── TAB 1: STAFF LOGINS & ACCOUNTS ────────────────── */}
      {tab === 'staff' && (
        <Card>
          <CardHeader
            title="All Staff Logins & Permissions"
            count={filteredUsers.length}
            action={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search staff, role, specialization..."
                className="w-60"
              />
            }
          />

          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)] space-y-2">
              <p>No staff accounts found.</p>
              <Link href="/register" className="inline-block text-[var(--green-700)] font-semibold hover:underline">
                + Register New Staff / Doctor Account
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredUsers.map((u) => {
                const pill = ROLE_PILL[u.role] || { variant: 'info' as const, label: u.role };
                return (
                  <div
                    key={u.id}
                    className={clsx(
                      'flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-[var(--r-tile)] p-3.5 border transition-all shadow-2xs',
                      u.is_active ? 'bg-[var(--bg-tile)] border-[var(--line-soft)]' : 'bg-red-50/50 border-red-200 opacity-75'
                    )}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <Avatar name={u.full_name} size="md" className="shrink-0 hidden xs:flex" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--text-strong)] leading-tight">{u.full_name}</span>
                          <StatusPill variant={pill.variant} label={pill.label} />
                          {!u.is_active ? (
                            <StatusPill variant="danger" label="Deactivated" />
                          ) : (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              Active Login
                            </span>
                          )}
                          {u.id === currentUser?.id && (
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">
                              Current Session
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                          <span className="font-mono text-[var(--text-strong)]">{u.email}</span>
                          {u.phone && <span>· Phone: {u.phone}</span>}
                          {u.specialization && (
                            <span className="text-[var(--green-700)] font-medium">
                              · {u.specialization} ({u.consultation_room || 'Room 1'})
                            </span>
                          )}
                          {u.opd_timings && <span>· Timings: {u.opd_timings}</span>}
                          {u.consultation_fee && <span>· Fee: ₹{u.consultation_fee}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Active/Deactivate, Edit, Delete */}
                    <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]/60">
                      <button
                        title={u.is_active ? 'Deactivate Login (Block Access)' : 'Activate Login'}
                        onClick={() => handleToggleUserActive(u)}
                        disabled={u.id === currentUser?.id}
                        className={clsx(
                          'h-10 sm:h-8 px-3 sm:px-2.5 flex items-center justify-center gap-1.5 text-xs rounded-[var(--r-control)] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed min-h-[40px] sm:min-h-0',
                          u.is_active
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        )}
                      >
                        {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                        <span>{u.is_active ? 'Deactivate' : 'Activate'}</span>
                      </button>

                      <button
                        title="Edit Login Details"
                        onClick={() => setEditingUser({ ...u })}
                        className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-card)] transition-colors min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0"
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        title={u.id === currentUser?.id ? 'Cannot delete your active login session' : 'Delete User Login'}
                        onClick={() => setDeletingUser(u)}
                        disabled={u.id === currentUser?.id}
                        className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────── TAB 2: ALL PATIENTS ────────────────── */}
      {tab === 'patients' && (
        <Card>
          <CardHeader
            title="Complete Hospital Patient Registry"
            count={filteredPatients.length}
            action={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search patient, phone, UHID..."
                className="w-60"
              />
            }
          />

          {filteredPatients.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)] space-y-2">
              <p>No registered patients found in database.</p>
              <Link href="/reception/register" className="inline-block text-[var(--green-700)] font-semibold hover:underline">
                + Register New Patient
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredPatients.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3.5 sm:p-4 border border-[var(--line-soft)] shadow-2xs"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-[var(--sage-100)] flex items-center justify-center font-bold text-xs text-[var(--green-900)] shrink-0 border border-[var(--green-300)]">
                      {p.blood_group || '—'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-strong)] leading-tight">{p.name}</span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">{p.age} years</span>
                        {p.has_bp && <StatusPill variant="warning" label="BP" />}
                        {p.has_sugar && <StatusPill variant="info" label="Diabetes" />}
                      </div>
                      <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                        <span className="font-mono text-[var(--text-strong)] font-semibold">{p.uhid}</span>
                        <span>·</span>
                        <span>Phone: {p.phone}</span>
                        {p.other_conditions && (
                          <>
                            <span>·</span>
                            <span className="italic">{p.other_conditions}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]/60">
                    <button
                      title="Edit Patient"
                      onClick={() => setEditingPatient({ ...p })}
                      className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-card)] transition-colors min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      title="Delete Patient"
                      onClick={() => setDeletingPatient(p)}
                      className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 transition-colors min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────── TAB 3: VISITS & QUEUE ────────────────── */}
      {tab === 'visits' && (
        <Card>
          <CardHeader
            title="All OPD Visits & Active Tokens"
            count={filteredVisits.length}
            action={
              <div className="flex items-center gap-2 flex-wrap">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search patient or doctor..."
                  className="w-full sm:w-52"
                />
              </div>
            }
          />

          {/* Monthly Reporting & Cleanup Controls */}
          <div className="bg-[var(--bg-tile)] p-3 sm:p-4 rounded-[var(--r-tile)] border border-[var(--line-soft)] mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[var(--text-strong)] flex items-center gap-1.5">
                <Calendar size={14} className="text-[var(--green-700)]" />
                Select Period / Month:
              </span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs bg-white font-medium text-[var(--text-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--green-700)] cursor-pointer"
              >
                <option value="all">All Time (Complete Database History · {visits.length} records)</option>
                {availableMonths.map((ym) => (
                  <option key={ym} value={ym}>
                    {formatMonthName(ym)} ({visits.filter((v) => getYearMonth(v.created_at) === ym).length} visits)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="secondary"
                icon={<Printer size={13} />}
                onClick={() => setShowMonthlyReportModal(true)}
              >
                Generate Monthly Report
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={13} />}
                onClick={() => {
                  setDeleteConfirmText('');
                  setShowMonthlyDeleteModal(true);
                }}
              >
                Clean-up Monthly Data
              </Button>
            </div>
          </div>

          {/* Month Summary KPI Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div className="bg-white p-2.5 rounded-[var(--r-control)] border border-[var(--line-soft)] shadow-2xs">
              <span className="text-[11px] text-[var(--text-muted)] block">Period Total Visits</span>
              <span className="text-lg font-bold text-[var(--text-strong)] tabular-nums">{monthStats.total}</span>
            </div>
            <div className="bg-white p-2.5 rounded-[var(--r-control)] border border-[var(--line-soft)] shadow-2xs">
              <span className="text-[11px] text-[var(--text-muted)] block">Completed / Dispensed</span>
              <span className="text-lg font-bold text-[var(--green-700)] tabular-nums">{monthStats.dispensed}</span>
            </div>
            <div className="bg-white p-2.5 rounded-[var(--r-control)] border border-[var(--line-soft)] shadow-2xs">
              <span className="text-[11px] text-[var(--text-muted)] block">At Pharmacy / Rx</span>
              <span className="text-lg font-bold text-[#8A6520] tabular-nums">{monthStats.prescribed}</span>
            </div>
            <div className="bg-white p-2.5 rounded-[var(--r-control)] border border-[var(--line-soft)] shadow-2xs">
              <span className="text-[11px] text-[var(--text-muted)] block">Waiting / In Cabin</span>
              <span className="text-lg font-bold text-[var(--info)] tabular-nums">{monthStats.waiting + monthStats.consulting}</span>
            </div>
          </div>

          {filteredVisits.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)] space-y-2">
              <p>No patient visits found for this selection.</p>
              <Link href="/reception/register" className="inline-block text-[var(--green-700)] font-semibold hover:underline">
                + Register Patient Visit
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredVisits.map((v) => {
                const pat = patients.find((p) => p.id === v.patient_id);
                const doc = doctors.find((d) => d.id === v.doctor_id);
                return (
                  <div
                    key={v.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3.5 sm:p-4 border border-[var(--line-soft)] shadow-2xs"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="shrink-0 w-12 text-center bg-white rounded-[var(--r-control)] py-1.5 px-1 border border-[var(--line-soft)] shadow-2xs">
                        <p className="text-[18px] leading-none font-bold text-[var(--green-900)] tabular-nums">
                          #{String(v.token_number).padStart(2, '0')}
                        </p>
                        <p className="text-[9px] text-[var(--text-faint)] mt-1 font-bold">TOKEN</p>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--text-strong)] leading-tight">
                            {pat?.name || 'Patient'}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] font-mono">{v.visit_number}</span>
                          <StatusPill
                            variant={v.status === 'dispensed' ? 'success' : v.status === 'prescribed' ? 'warning' : 'info'}
                            label={v.status}
                          />
                        </div>
                        <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                          <span>
                            Doctor: <strong className="text-[var(--green-700)]">{doc?.full_name || 'Doctor'}</strong> ({doc?.specialization})
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">Date: {new Date(v.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {new Date(v.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          {v.follow_up_date && <span>· Follow-up: {v.follow_up_date}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]/60">
                      <button
                        title="Delete Visit"
                        onClick={() => handleDeleteVisit(v)}
                        className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 transition-colors shrink-0 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────── TAB 4: PRESCRIPTIONS ────────────────── */}
      {tab === 'prescriptions' && (
        <Card>
          <CardHeader title="All Prescriptions Generated" count={prescriptions.length} />

          {prescriptions.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)]">
              No prescriptions issued in the system yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {prescriptions.map((rx) => {
                const pat = patients.find((p) => p.id === rx.patient_id);
                const doc = doctors.find((d) => d.id === rx.doctor_id);
                return (
                  <div
                    key={rx.id}
                    className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 border border-[var(--line-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-strong)]">
                          Patient: {pat?.name} (UHID: {pat?.uhid})
                        </p>
                        <p className="text-xs text-[var(--green-700)] font-medium">
                          Consultant: {doc?.full_name} ({doc?.specialization})
                        </p>
                      </div>
                      <button
                        title="Delete Prescription"
                        onClick={() => handleDeleteRx(rx.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-full bg-[var(--danger-bg)] text-[var(--danger)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {rx.items && rx.items.length > 0 && (
                      <div className="bg-white rounded-[var(--r-control)] p-2.5 text-xs border border-[var(--line-soft)] mb-2">
                        <p className="font-semibold text-[var(--text-muted)] mb-1">Prescribed Medicines:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {rx.items.map((i) => (
                            <li key={i.id}>
                              <strong>{i.drug_name}</strong> — {i.num_days} days (Qty: {i.quantity})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {rx.notes && (
                      <p className="text-xs text-[var(--text-muted)] italic">
                        Advice: &quot;{rx.notes}&quot;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────── TAB 5: DRUG CATALOG ────────────────── */}
      {tab === 'inventory' && (
        <Card>
          <CardHeader
            title="Pharmacy Drug Catalog & Pricing Control"
            count={filteredDrugs.length}
            action={
              <Link href="/pharmacy/inventory/add">
                <Button size="sm" icon={<Plus size={14} />}>Add Drug</Button>
              </Link>
            }
          />

          {filteredDrugs.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)] space-y-2">
              <p>No medicines currently registered in inventory.</p>
              <Link href="/pharmacy/inventory/add" className="inline-block text-[var(--green-700)] font-semibold hover:underline">
                + Add Drug to Pharmacy Inventory
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredDrugs.map((drug) => (
                <div
                  key={drug.id}
                  className="flex items-center gap-3.5 bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3.5 sm:p-4 border border-[var(--line-soft)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--text-strong)]">{drug.name}</span>
                      <span className="text-[10px] bg-white px-2 py-0.5 rounded-[var(--r-pill)] border border-[var(--line-soft)] uppercase font-semibold">
                        {drug.drug_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                      <span>
                        Stock: <strong className="text-[var(--text-strong)]">{drug.stock_quantity} units</strong>
                      </span>
                      <span>·</span>
                      <span>Cost: ₹{drug.purchase_price.toFixed(2)}</span>
                      <span>·</span>
                      <span>MRP: ₹{drug.selling_price.toFixed(2)}</span>
                      <span>·</span>
                      <span>Expiry: {drug.expiry_date}</span>
                    </div>
                  </div>

                  <button
                    title="Delete Drug"
                    onClick={() => handleDeleteDrug(drug)}
                    className="h-8 w-8 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      </div>

      {/* ────────────────── MODAL: EDIT USER LOGIN ────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-lg shadow-[var(--shadow-float)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-lg font-semibold text-[var(--text-strong)]">Edit Staff Login & Account</h3>
              <button onClick={() => setEditingUser(null)} className="text-[var(--text-muted)] hover:text-black">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="text-[var(--text-muted)] block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingUser.full_name}
                  onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Email (Login ID)</label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Password</label>
                <input
                  type="text"
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                  placeholder="Set login password"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--text-muted)] block mb-1">Role</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                    className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs capitalize"
                  >
                    <option value="admin">Super Admin</option>
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="pharmacist">Pharmacist</option>
                  </select>
                </div>
                <div>
                  <label className="text-[var(--text-muted)] block mb-1">Phone</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                  />
                </div>
              </div>

              {editingUser.role === 'doctor' && (
                <div className="bg-[var(--bg-tile)] p-3 rounded-[var(--r-tile)] space-y-2 border">
                  <p className="font-semibold text-[var(--green-700)]">Doctor Differentiation</p>
                  <div>
                    <label className="text-[var(--text-muted)] block mb-1">Specialization</label>
                    <input
                      type="text"
                      value={editingUser.specialization || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, specialization: e.target.value })}
                      className="h-9 w-full rounded-[var(--r-control)] border px-2 text-base sm:text-xs bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[var(--text-muted)] block mb-1">Room / Cabin</label>
                      <input
                        type="text"
                        value={editingUser.consultation_room || ''}
                        onChange={(e) => setEditingUser({ ...editingUser, consultation_room: e.target.value })}
                        className="h-9 w-full rounded-[var(--r-control)] border px-2 text-base sm:text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[var(--text-muted)] block mb-1">Fee (₹)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editingUser.consultation_fee || 500}
                        onChange={(e) => setEditingUser({ ...editingUser, consultation_fee: Number(e.target.value) })}
                        className="h-9 w-full rounded-[var(--r-control)] border px-2 text-base sm:text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button type="submit" className="flex-1 min-h-[44px]">Save Changes</Button>
                <Button type="button" variant="secondary" onClick={() => setEditingUser(null)} className="flex-1 min-h-[44px]">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL: DELETE USER CONFIRMATION ────────────────── */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-sm shadow-[var(--shadow-float)] text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-strong)] mb-1">Delete Account?</h3>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              Permanently delete staff login for <strong>{deletingUser.full_name}</strong> ({deletingUser.email})?
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleDeleteUserConfirm}>
                Yes, Delete
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setDeletingUser(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL: EDIT PATIENT ────────────────── */}
      {editingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-md shadow-[var(--shadow-float)]">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-base font-semibold text-[var(--text-strong)]">Edit Patient Record</h3>
              <button onClick={() => setEditingPatient(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePatientEdit} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[var(--text-muted)] block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingPatient.name}
                  onChange={(e) => setEditingPatient({ ...editingPatient, name: e.target.value })}
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--text-muted)] block mb-1">Age</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editingPatient.age}
                    onChange={(e) => setEditingPatient({ ...editingPatient, age: Number(e.target.value) })}
                    className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-[var(--text-muted)] block mb-1">Phone</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={editingPatient.phone}
                    onChange={(e) => setEditingPatient({ ...editingPatient, phone: e.target.value })}
                    className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Conditions / Notes</label>
                <input
                  type="text"
                  value={editingPatient.other_conditions || ''}
                  onChange={(e) => setEditingPatient({ ...editingPatient, other_conditions: e.target.value })}
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-base sm:text-xs"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button type="submit" className="flex-1 min-h-[44px]">Save Patient</Button>
                <Button type="button" variant="secondary" onClick={() => setEditingPatient(null)} className="flex-1 min-h-[44px]">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL: DELETE PATIENT CONFIRMATION ────────────────── */}
      {deletingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-sm shadow-[var(--shadow-float)] text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-strong)] mb-1">Delete Patient?</h3>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              Permanently delete <strong>{deletingPatient.name}</strong> ({deletingPatient.uhid}) and all associated visits?
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleDeletePatientConfirm}>
                Yes, Delete
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setDeletingPatient(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ────────────────── MODAL: MONTHLY REPORT ────────────────── */}
      {showMonthlyReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-3xl shadow-[var(--shadow-float)] max-h-[90vh] overflow-y-auto paper-a4">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text-strong)] flex items-center gap-2">
                  <FileText size={18} className="text-[var(--green-700)]" />
                  Monthly OPD & Patient Report
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {selectedMonth === 'all' ? 'All Time Database Summary' : formatMonthName(selectedMonth)} · {settings.hospital_name}
                </p>
              </div>
              <button onClick={() => setShowMonthlyReportModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-strong)] cursor-pointer no-print">
                <X size={18} />
              </button>
            </div>

            {/* Printable summary card */}
            <div className="bg-[var(--bg-tile)] p-4 rounded-[var(--r-tile)] border border-[var(--line-soft)] mb-4 text-xs space-y-2">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-sm text-[var(--text-strong)]">{settings.hospital_name}</span>
                <span className="text-[var(--text-muted)]">Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)]">Total Consultations:</span>
                  <p className="text-sm font-bold text-[var(--text-strong)]">{monthStats.total}</p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Dispensed by Pharmacy:</span>
                  <p className="text-sm font-bold text-[var(--green-700)]">{monthStats.dispensed}</p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Prescriptions Issued:</span>
                  <p className="text-sm font-bold text-[#8A6520]">{monthStats.prescribed}</p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Active in Queue:</span>
                  <p className="text-sm font-bold text-[var(--info)]">{monthStats.waiting + monthStats.consulting}</p>
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="border border-[var(--line-soft)] rounded-[var(--r-tile)] overflow-hidden mb-4 text-xs">
              <div className="max-h-80 overflow-y-auto print:max-h-none print:overflow-visible">
                <table className="w-full text-left">
                  <thead className="bg-[var(--bg-tile)] sticky top-0 border-b border-[var(--line-soft)] text-[var(--text-muted)] text-[11px]">
                    <tr>
                      <th className="p-2.5">Token</th>
                      <th className="p-2.5">Patient Name</th>
                      <th className="p-2.5">UHID</th>
                      <th className="p-2.5">Consultant</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line-soft)]">
                    {visitsForSelectedPeriod.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-[var(--text-muted)]">
                          No patient records found for this period.
                        </td>
                      </tr>
                    ) : (
                      visitsForSelectedPeriod.map((v) => {
                        const pat = patients.find((p) => p.id === v.patient_id);
                        const doc = doctors.find((d) => d.id === v.doctor_id || d.user_id === v.doctor_id);
                        return (
                          <tr key={v.id} className="hover:bg-[var(--bg-card)] avoid-break">
                            <td className="p-2.5 font-bold tabular-nums">#{String(v.token_number).padStart(2, '0')}</td>
                            <td className="p-2.5 font-medium">{pat?.name || 'Patient'}</td>
                            <td className="p-2.5 font-mono text-[11px]">{pat?.uhid || '—'}</td>
                            <td className="p-2.5 text-[var(--green-800)]">{doc?.full_name || 'Doctor'}</td>
                            <td className="p-2.5">
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gray-100">
                                {v.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right text-[var(--text-muted)] tabular-nums">
                              {new Date(v.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 no-print">
              <Button
                variant="secondary"
                icon={<Printer size={15} />}
                onClick={() => window.print()}
                className="flex-1"
                title="Print Report on A4 / Letter printer"
              >
                Print Report
              </Button>
              <Button variant="secondary" onClick={() => setShowMonthlyReportModal(false)} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL: MONTHLY DATA CLEAN-UP ────────────────── */}
      {showMonthlyDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-md shadow-[var(--shadow-float)]">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-strong)]">Monthly Data Clean-Up</h3>
                <p className="text-xs text-[var(--text-muted)]">Permanent database deletion of historical visits</p>
              </div>
            </div>

            <div className="space-y-3 mb-4 text-xs">
              <p className="text-[var(--text-muted)]">
                Select deletion scope. Prescriptions and dispensing history associated with the selected visits will also be cleaned up.
              </p>

              <div className="space-y-2 border border-[var(--line-soft)] rounded-[var(--r-control)] p-3 bg-[var(--bg-tile)]">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'month'}
                    onChange={() => setDeleteMode('month')}
                    className="mt-0.5 accent-[var(--green-900)]"
                  />
                  <div>
                    <span className="font-semibold block text-[var(--text-strong)]">
                      Delete specific month: {selectedMonth === 'all' ? 'Select a month from dropdown first' : formatMonthName(selectedMonth)}
                    </span>
                    <span className="text-[var(--text-muted)] text-[11px]">
                      {selectedMonth === 'all'
                        ? 'Disabled: Select a specific month from the period dropdown on the page'
                        : `${visitsForSelectedPeriod.length} visits found for ${formatMonthName(selectedMonth)}`}
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-[var(--line-soft)]">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'older30'}
                    onChange={() => setDeleteMode('older30')}
                    className="mt-0.5 accent-[var(--green-900)]"
                  />
                  <div>
                    <span className="font-semibold block text-[var(--text-strong)]">
                      Purge all records older than 30 days
                    </span>
                    <span className="text-[var(--text-muted)] text-[11px]">
                      {visitsOlderThan30Days.length} visits eligible for purge (&gt;30 days old)
                    </span>
                  </div>
                </label>
              </div>

              <div className="bg-red-50 p-2.5 rounded-[var(--r-control)] border border-red-200 text-red-800 text-[11px]">
                <strong className="block mb-0.5">Safety Confirmation:</strong>
                To prevent accidental deletion, type <strong>DELETE</strong> in the box below to authorize.
              </div>

              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="h-10 w-full rounded-[var(--r-control)] border px-3 text-xs font-mono uppercase bg-white"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={
                  deleteConfirmText.trim().toUpperCase() !== 'DELETE' ||
                  isDeletingMonthlyData ||
                  (deleteMode === 'month' && (selectedMonth === 'all' || visitsForSelectedPeriod.length === 0)) ||
                  (deleteMode === 'older30' && visitsOlderThan30Days.length === 0)
                }
                onClick={handleExecuteMonthlyDelete}
                className="flex-1"
              >
                {isDeletingMonthlyData ? 'Deleting Data...' : 'Permanently Delete'}
              </Button>
              <Button
                variant="secondary"
                disabled={isDeletingMonthlyData}
                onClick={() => {
                  setShowMonthlyDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
