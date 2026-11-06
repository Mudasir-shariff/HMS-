'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  Hash,
  Clock,
  Phone,
  Stethoscope,
  Search,
  BedDouble,
  ArrowRight,
  CheckCircle,
  Pill,
  ChevronRight,
  Check,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, SearchInput, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useVisits, usePatients, useDoctors } from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { deleteVisitsFromSupabase } from '@/lib/supabase/sync';
import { broadcastChange } from '@/lib/realtime/realtime-provider';
import { useAuth } from '@/lib/auth/context';
import type { VisitStatus, Visit } from '@/lib/types/database';
import { clsx } from 'clsx';

type StageFilter = 'all' | 'with_doctor' | 'waiting' | 'in_consultation' | 'prescribed' | 'dispensed';

const statusMap: Record<VisitStatus, { variant: 'info' | 'success' | 'danger' | 'warning'; label: string }> = {
  waiting: { variant: 'warning', label: 'In Doctor Queue' },
  in_consultation: { variant: 'info', label: 'In Consultation' },
  prescribed: { variant: 'warning', label: 'At Pharmacy' },
  dispensed: { variant: 'success', label: 'Dispensed' },
  completed: { variant: 'success', label: 'Completed' },
};

export default function ReceptionPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const [search, setSearch] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  }

  const [updatingVisitId, setUpdatingVisitId] = useState<string | null>(null);
  const [selectedVisitIds, setSelectedVisitIds] = useState<string[]>([]);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'single' | 'bulk';
    visit?: (typeof todayVisits)[0];
    visitIds: string[];
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleToggleSelect(visitId: string) {
    setSelectedVisitIds((prev) =>
      prev.includes(visitId) ? prev.filter((id) => id !== visitId) : [...prev, visitId]
    );
  }

  function handleToggleSelectAll() {
    const currentFilteredIds = filtered.map((v) => v.id);
    const allSelected = currentFilteredIds.length > 0 && currentFilteredIds.every((id) => selectedVisitIds.includes(id));
    if (allSelected) {
      setSelectedVisitIds((prev) => prev.filter((id) => !currentFilteredIds.includes(id)));
    } else {
      setSelectedVisitIds((prev) => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  }

  async function executeDelete() {
    if (!deleteConfirmTarget || isDeleting) return;
    setIsDeleting(true);

    const idsToDelete = deleteConfirmTarget.visitIds;
    const count = idsToDelete.length;

    // 1. Optimistic Query Cache Update (<5ms)
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.filter((v) => !idsToDelete.includes(v.id)) : []
    );

    // 2. Remove deleted IDs from current selection
    setSelectedVisitIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));

    // 3. Instant Peer Broadcast across all hospital devices
    broadcastChange('visits_deleted', { visitIds: idsToDelete });

    // 4. Instant UI Toast
    triggerToast(
      count === 1
        ? 'Patient visit removed from the queue.'
        : `${count} patient visits removed from the queue.`
    );

    // 5. Background Supabase deletion & query invalidation
    try {
      await deleteVisitsFromSupabase(idsToDelete);
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('Failed to delete visits from Supabase:', err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  }

  // Optimized O(1) map lookups and memoized todayVisits
  const { todayVisits, waitingOnly, consultingOnly, pharmacyOnly, dispensedOnly, countWaitingTotal } = useMemo(() => {
    const patientMap = new Map<string, (typeof patients)[0]>();
    patients.forEach((p) => patientMap.set(p.id, p));

    const doctorMap = new Map<string, (typeof doctors)[0]>();
    doctors.forEach((d) => {
      doctorMap.set(d.id, d);
      if (d.user_id) doctorMap.set(d.user_id, d);
    });

    const tv = visits
      .map((v) => {
        const patient = patientMap.get(v.patient_id);
        const doc = doctorMap.get(v.doctor_id);
        return {
          ...v,
          patientName: patient?.name || 'Unknown Patient',
          patientUhid: patient?.uhid || '—',
          patientPhone: patient?.phone || '—',
          patientAge: patient?.age || 0,
          hasBP: patient?.has_bp || false,
          hasSugar: patient?.has_sugar || false,
          doctorName: doc?.full_name || 'Dr. Assigned',
          doctorSpec: doc?.specialization || 'OPD',
          doctorRoom: doc?.consultation_room || 'Room 1',
        };
      })
      .sort((a, b) => a.token_number - b.token_number);

    let w = 0, c = 0, p = 0, d = 0;
    tv.forEach((v) => {
      if (v.status === 'waiting') w++;
      else if (v.status === 'in_consultation') c++;
      else if (v.status === 'prescribed') p++;
      else if (v.status === 'dispensed' || v.status === 'completed') d++;
    });

    return {
      todayVisits: tv,
      waitingOnly: w,
      consultingOnly: c,
      pharmacyOnly: p,
      dispensedOnly: d,
      countWaitingTotal: w + c,
    };
  }, [visits, patients, doctors]);

  const filtered = useMemo(() => {
    return todayVisits
      .filter((v) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          (v.patientName || '').toLowerCase().includes(q) ||
          (v.patientPhone || '').toLowerCase().includes(q) ||
          (v.patientUhid || '').toLowerCase().includes(q) ||
          (v.visit_number || '').toLowerCase().includes(q);

        const matchesDoc =
          doctorFilter === 'all' ||
          v.doctor_id === doctorFilter;

        let matchesStage = true;
        if (stageFilter === 'with_doctor') matchesStage = v.status === 'waiting' || v.status === 'in_consultation';
        else if (stageFilter === 'waiting') matchesStage = v.status === 'waiting';
        else if (stageFilter === 'in_consultation') matchesStage = v.status === 'in_consultation';
        else if (stageFilter === 'prescribed') matchesStage = v.status === 'prescribed';
        else if (stageFilter === 'dispensed') matchesStage = v.status === 'dispensed' || v.status === 'completed';

        return matchesSearch && matchesDoc && matchesStage;
      })
      .sort((a, b) => a.token_number - b.token_number);
  }, [todayVisits, search, doctorFilter, stageFilter]);

  // Action: Direct status transition on a specific row with double-click guard
  async function handleMoveToCabin(visitId: string, token: number) {
    if (updatingVisitId === visitId) return;
    setUpdatingVisitId(visitId);
    const supabase = createClient();
    const updated_at = new Date().toISOString();
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.map((v) => (v.id === visitId ? { ...v, status: 'in_consultation', updated_at } : v)) : []
    );
    // Instant WebSocket peer broadcast (<30ms)
    broadcastChange('visit_updated', { visit: { id: visitId, status: 'in_consultation' } });

    // Instant UI feedback (<10ms)
    triggerToast(`Token #${String(token).padStart(2, '0')} called into Doctor Consultation Cabin.`);
    setUpdatingVisitId(null);

    // Sync to Supabase in background
    try {
      const { error } = await supabase.from('visits').update({ status: 'in_consultation', updated_at }).eq('id', visitId);
      if (error) {
        console.warn('Supabase update error:', error.message);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('handleMoveToCabin error:', err);
    }
  }

  async function handleSendToPharmacy(visitId: string, token: number) {
    if (updatingVisitId === visitId) return;
    setUpdatingVisitId(visitId);
    const supabase = createClient();
    const updated_at = new Date().toISOString();
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.map((v) => (v.id === visitId ? { ...v, status: 'prescribed', updated_at } : v)) : []
    );
    // Instant WebSocket peer broadcast (<30ms)
    broadcastChange('visit_updated', { visit: { id: visitId, status: 'prescribed' } });

    // Instant UI feedback (<10ms)
    triggerToast(`Prescription saved. Token #${String(token).padStart(2, '0')} moved to Pharmacy Dispensing Queue.`);
    setUpdatingVisitId(null);

    // Sync to Supabase in background
    try {
      const { error } = await supabase.from('visits').update({ status: 'prescribed', updated_at }).eq('id', visitId);
      if (error) {
        console.warn('Supabase update error:', error.message);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('handleSendToPharmacy error:', err);
    }
  }

  async function handleQuickDeliver(visitId: string, token: number) {
    if (updatingVisitId === visitId) return;
    setUpdatingVisitId(visitId);
    const supabase = createClient();
    const updated_at = new Date().toISOString();
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.map((v) => (v.id === visitId ? { ...v, status: 'dispensed', updated_at } : v)) : []
    );
    // Instant WebSocket peer broadcast (<30ms)
    broadcastChange('visit_updated', { visit: { id: visitId, status: 'dispensed' } });

    // Instant UI feedback (<10ms)
    triggerToast(`Token #${String(token).padStart(2, '0')} marked as Delivered!`);
    setUpdatingVisitId(null);

    // Sync to Supabase in background
    try {
      const { error } = await supabase.from('visits').update({ status: 'dispensed', updated_at }).eq('id', visitId);
      if (error) {
        console.warn('Supabase update error:', error.message);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('handleQuickDeliver error:', err);
    }
  }

  return (
    <>
      <PageHeader
        title="OPD Reception Desk"
        subtitle={`Welcome, ${user?.fullName || 'Receptionist'} · Seamless Reception → Doctor → Pharmacy Patient Flow`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/ip">
              <Button variant="secondary" size="sm" icon={<BedDouble size={14} />}>
                IP Admissions
              </Button>
            </Link>
            <Link href="/reception/register">
              <Button size="sm" icon={<Plus size={14} />}>Register New Patient</Button>
            </Link>
          </div>
        }
      />

      {/* Live Toast Notification Banner */}
      {toastMessage && (
        <div className="mb-5 bg-[var(--green-900)] text-white text-xs font-medium px-4 py-2.5 rounded-[var(--r-tile)] flex items-center justify-between shadow-[var(--shadow-float)] animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle size={15} className="text-[var(--sage-200)] shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPI Tiles - Interactive, Dynamic & Click-Filterable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5 sm:mb-6">
        {[
          {
            stage: 'all' as StageFilter,
            label: 'Total Registered Today',
            value: todayVisits.length,
            icon: <Hash size={18} />,
            color: 'text-[var(--text-strong)]',
            subtext: 'All visits registered today',
          },
          {
            stage: 'with_doctor' as StageFilter,
            label: 'With Doctor (Queue/Cabin)',
            value: countWaitingTotal,
            icon: <Clock size={18} />,
            color: 'text-amber-800',
            subtext: `${waitingOnly} in lobby · ${consultingOnly} in cabin`,
          },
          {
            stage: 'prescribed' as StageFilter,
            label: 'Pending at Pharmacy',
            value: pharmacyOnly,
            icon: <Pill size={18} />,
            color: 'text-blue-800',
            subtext: 'Prescriptions ready to dispense',
          },
          {
            stage: 'dispensed' as StageFilter,
            label: 'Completed / Dispensed',
            value: dispensedOnly,
            icon: <CheckCircle size={18} />,
            color: 'text-[var(--green-800)]',
            subtext: 'Medicines handed over & done',
          },
        ].map((t) => {
          const isSelected = stageFilter === t.stage;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setStageFilter(t.stage)}
              className={clsx(
                'rounded-[var(--r-tile)] p-3 sm:p-4 flex flex-col justify-between text-left transition-all duration-150 cursor-pointer border min-h-[96px] sm:min-h-[112px]',
                isSelected
                  ? 'bg-white border-2 border-[var(--green-700)] shadow-[var(--shadow-float)] ring-2 ring-[var(--green-600)]/20'
                  : 'bg-[var(--bg-card)] border-[var(--line-soft)] hover:border-[var(--green-600)]/60 hover:bg-white hover:shadow-xs'
              )}
            >
              <div className="flex items-center justify-between w-full mb-1 sm:mb-2">
                <div
                  className={clsx(
                    'h-8 w-8 sm:h-9 sm:w-9 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors',
                    isSelected
                      ? 'border-[var(--green-700)] bg-[var(--sage-100)] text-[var(--green-800)]'
                      : 'border-[var(--line-soft)] bg-white text-[var(--text-muted)]'
                  )}
                >
                  {t.icon}
                </div>
                <div className="flex items-center gap-1.5">
                  <p className={clsx('text-2xl sm:text-3xl leading-none font-bold tabular-nums tracking-tight', t.color)}>
                    {t.value}
                  </p>
                </div>
              </div>
              <div className="min-w-0 w-full">
                <p className="text-xs font-semibold text-[var(--text-strong)] leading-snug line-clamp-2">
                  {t.label}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-1 hidden sm:block">
                  {t.subtext}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Doctor Cabins Live Load Monitor */}
      <div className="mb-5 sm:mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <Stethoscope size={14} className="text-[var(--green-700)]" />
            Doctor Consultation Cabins & Queue Load
          </h3>
        </div>

        {doctors.length === 0 ? (
          <div className="bg-white rounded-[var(--r-tile)] p-4 border border-[var(--line-soft)] shadow-xs flex items-center justify-between text-xs text-[var(--text-muted)]">
            <p>No doctor consultation cabins currently registered.</p>
            <Link href="/register" className="font-semibold text-[var(--green-700)] hover:underline">
              + Register Doctor
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {doctors.map((doc) => {
              const docWaiting = todayVisits.filter((v) => v.doctor_id === doc.id && v.status === 'waiting').length;
              const docInConsult = todayVisits.filter((v) => v.doctor_id === doc.id && v.status === 'in_consultation').length;
              const docDone = todayVisits.filter(
                (v) => v.doctor_id === doc.id && (v.status === 'prescribed' || v.status === 'dispensed')
              ).length;

              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-[var(--r-tile)] p-3 sm:p-3.5 border border-[var(--line-soft)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-xs text-[var(--text-strong)]">{doc.full_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {doc.specialization} · <strong>{doc.consultation_room}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {docInConsult > 0 && (
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full border border-blue-200 animate-pulse">
                        In Cabin ({docInConsult})
                      </span>
                    )}
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                      Waiting: {docWaiting}
                    </span>
                    <span className="text-[10px] bg-gray-100 text-gray-700 font-medium px-1.5 py-0.5 rounded-full">
                      Done: {docDone}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Reception Queue Card */}
      <Card>
        <CardHeader
          title="Hospital Patient Journey Queue"
          count={filtered.length}
          action={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                {/* Doctor filter dropdown */}
                <select
                  value={doctorFilter}
                  onChange={(e) => setDoctorFilter(e.target.value)}
                  className="h-10 sm:h-9 rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] px-3 text-base sm:text-xs text-[var(--text-body)] focus:outline-none focus:border-[var(--green-600)] shrink-0 min-h-[40px] sm:min-h-0"
                >
                  <option value="all">All Doctors</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.specialization})
                    </option>
                  ))}
                </select>

                {/* Stage filter pills */}
                <div className="flex gap-1 bg-[var(--bg-canvas)] rounded-[var(--r-pill)] p-0.5 border border-[var(--line-soft)] text-xs shrink-0 snap-x">
                  {[
                    { id: 'all' as StageFilter, label: 'All' },
                    { id: 'with_doctor' as StageFilter, label: 'Doctor Queue' },
                    { id: 'prescribed' as StageFilter, label: 'Pharmacy' },
                    { id: 'dispensed' as StageFilter, label: 'Dispensed' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStageFilter(s.id)}
                      className={clsx(
                        'px-2.5 py-1.5 sm:py-1 rounded-[var(--r-pill)] font-medium transition-all shrink-0 min-h-[36px] sm:min-h-0 snap-start',
                        stageFilter === s.id
                          ? 'bg-[var(--green-900)] text-white shadow-xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search patient, phone, UHID..."
                className="w-full sm:w-56"
              />
            </div>
          }
        />

        {/* Bulk Selection & Queue Management Toolbar */}
        {filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 py-2.5 mb-2 bg-[var(--bg-canvas)]/60 rounded-[var(--r-control)] border border-[var(--line-soft)]">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-[var(--text-strong)] hover:text-[var(--green-900)] transition-colors">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((v) => selectedVisitIds.includes(v.id))}
                  onChange={handleToggleSelectAll}
                  className="h-4 w-4 rounded border-[var(--line-soft)] text-[var(--green-900)] focus:ring-[var(--green-600)] accent-[var(--green-900)] cursor-pointer"
                />
                <span>Select All ({filtered.length})</span>
              </label>

              {selectedVisitIds.length > 0 && (
                <span className="text-xs text-[var(--green-800)] font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {selectedVisitIds.length} of {filtered.length} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedVisitIds.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedVisitIds([])}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-strong)] font-medium px-2.5 py-1.5 rounded-[var(--r-control)] hover:bg-white border border-transparent hover:border-[var(--line-soft)] transition-colors cursor-pointer"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTarget({ type: 'bulk', visitIds: selectedVisitIds })}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--r-control)] bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    {selectedVisitIds.length === filtered.length
                      ? `Delete All (${selectedVisitIds.length})`
                      : `Delete Selected (${selectedVisitIds.length})`}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const allIds = filtered.map((v) => v.id);
                    setSelectedVisitIds(allIds);
                    setDeleteConfirmTarget({ type: 'bulk', visitIds: allIds });
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium px-2.5 py-1 rounded-[var(--r-control)] border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                  title="Select all and delete all visits currently in this queue"
                >
                  <Trash2 size={13} />
                  Delete All ({filtered.length})
                </button>
              )}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Hash size={20} />}
            title="No patients match the selected filter"
            description="Try changing the filter or register a new patient."
            action={
              <div className="flex items-center gap-2">
                {stageFilter !== 'all' && (
                  <Button size="sm" variant="secondary" onClick={() => setStageFilter('all')}>
                    Show All Patients
                  </Button>
                )}
                <Link href="/reception/register">
                  <Button size="sm" icon={<Plus size={14} />}>
                    + Register New Patient
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((item) => {
              const s = statusMap[item.status] || { variant: 'info' as const, label: item.status };
              const timeStr = new Date(item.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={item.id}
                  className={clsx(
                    'flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-[var(--r-tile)] p-3.5 sm:px-4 sm:py-3.5 border transition-all',
                    selectedVisitIds.includes(item.id)
                      ? 'bg-emerald-50/50 border-[var(--green-600)] shadow-2xs'
                      : 'bg-white border-[var(--line-soft)] hover:border-[var(--green-600)]/50 hover:shadow-subtle'
                  )}
                >
                  {/* Patient Details Row / Block */}
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                    {/* Row Select Checkbox */}
                    <label
                      className="shrink-0 flex items-center justify-center p-1 cursor-pointer"
                      title={selectedVisitIds.includes(item.id) ? 'Deselect patient' : 'Select patient'}
                    >
                      <input
                        type="checkbox"
                        checked={selectedVisitIds.includes(item.id)}
                        onChange={() => handleToggleSelect(item.id)}
                        className="h-4 w-4 rounded border-[var(--line-soft)] text-[var(--green-900)] focus:ring-[var(--green-600)] accent-[var(--green-900)] cursor-pointer"
                      />
                    </label>

                    {/* Token Number */}
                    <div className="shrink-0 h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-[var(--sage-100)] flex flex-col items-center justify-center border-2 border-[var(--green-600)] shadow-2xs">
                      <span className="text-base sm:text-lg font-extrabold text-[var(--green-900)] leading-none tabular-nums">
                        {String(item.token_number).padStart(2, '0')}
                      </span>
                      <span className="text-[7px] sm:text-[8px] font-bold text-[var(--green-700)] mt-0.5 tracking-wider">TOKEN</span>
                    </div>

                    <Avatar name={item.patientName} size="md" className="shrink-0 hidden xs:flex" />

                    {/* Patient Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-strong)] leading-tight">{item.patientName}</span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">{item.patientAge} yrs</span>
                        {item.hasBP && <StatusPill variant="warning" label="BP" />}
                        {item.hasSugar && <StatusPill variant="info" label="Sugar" />}
                      </div>
                      <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                        <span className="font-mono font-medium text-[var(--text-strong)]">{item.patientUhid}</span>
                        <span>·</span>
                        <span>{item.patientPhone}</span>
                        <span>·</span>
                        <span className="font-medium text-[var(--green-800)]">
                          {item.doctorName} ({item.doctorRoom})
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">{timeStr}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Pipeline Stepper & Interactive Action Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto pt-2.5 lg:pt-0 border-t lg:border-t-0 border-[var(--line-soft)]/60 justify-between lg:justify-end">
                    {/* 3-Step Journey Pipeline Stepper */}
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-[var(--r-control)] border border-[var(--line-soft)] text-[11px] overflow-x-auto no-scrollbar max-w-full shrink-0">
                      {/* Step 1: Reception */}
                      <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold shrink-0">
                        <CheckCircle size={12} /> Reception
                      </span>

                      <span className="text-[var(--text-faint)] shrink-0">→</span>

                      {/* Step 2: Doctor */}
                      {item.status === 'waiting' && (
                        <span className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                          <Clock size={11} /> Dr. Queue
                        </span>
                      )}
                      {item.status === 'in_consultation' && (
                        <span className="flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded animate-pulse shrink-0">
                          <Stethoscope size={11} /> In Cabin
                        </span>
                      )}
                      {(item.status === 'prescribed' || item.status === 'dispensed' || item.status === 'completed') && (
                        <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold shrink-0">
                          <CheckCircle size={12} /> Doctor Done
                        </span>
                      )}

                      <span className="text-[var(--text-faint)] shrink-0">→</span>

                      {/* Step 3: Pharmacy */}
                      {item.status === 'prescribed' && (
                        <span className="flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded animate-pulse shrink-0">
                          <Pill size={11} /> Pharmacy Queue
                        </span>
                      )}
                      {(item.status === 'dispensed' || item.status === 'completed') && (
                        <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold shrink-0">
                          <CheckCircle size={12} /> Dispensed
                        </span>
                      )}
                      {(item.status === 'waiting' || item.status === 'in_consultation') && (
                        <span className="text-[var(--text-faint)] shrink-0">Pharmacy</span>
                      )}
                    </div>

                    {/* Stage-Specific 1-Click Action Buttons */}
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                      {item.status === 'waiting' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMoveToCabin(item.id, item.token_number)}
                            className="text-xs font-semibold px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-[var(--r-control)] border border-blue-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
                            title="Call patient into doctor consultation room"
                          >
                            <Stethoscope size={14} />
                            Call into Cabin
                          </button>
                          <Link
                            href={`/doctor/prescribe?visitId=${item.id}&patientId=${item.patient_id}&token=${item.token_number}&name=${encodeURIComponent(
                              item.patientName
                            )}`}
                            className="w-full sm:w-auto"
                          >
                            <Button size="sm" variant="secondary" className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]" icon={<ChevronRight size={14} />} iconPosition="right">
                              Prescribe
                            </Button>
                          </Link>
                        </>
                      )}

                      {item.status === 'in_consultation' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSendToPharmacy(item.id, item.token_number)}
                            className="text-xs font-semibold px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-[var(--r-control)] border border-purple-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
                            title="Complete doctor visit and send patient to pharmacy queue"
                          >
                            <Pill size={14} />
                            To Pharmacy
                          </button>
                          <Link
                            href={`/doctor/prescribe?visitId=${item.id}&patientId=${item.patient_id}&token=${item.token_number}&name=${encodeURIComponent(
                              item.patientName
                            )}`}
                            className="w-full sm:w-auto"
                          >
                            <Button size="sm" className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]" icon={<ChevronRight size={14} />} iconPosition="right">
                              Write Rx
                            </Button>
                          </Link>
                        </>
                      )}

                      {item.status === 'prescribed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleQuickDeliver(item.id, item.token_number)}
                            className="text-xs font-semibold px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] bg-[var(--green-900)] text-white hover:bg-[var(--green-800)] rounded-[var(--r-control)] shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
                            title="Confirm delivery of prescribed medicines & deduct inventory"
                          >
                            <Check size={14} />
                            Mark Delivered
                          </button>
                          <Link
                            href={`/pharmacy/dispense?visitId=${item.id}&token=${item.token_number}`}
                            className="w-full sm:w-auto"
                          >
                            <Button size="sm" variant="secondary" className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]" icon={<ChevronRight size={14} />} iconPosition="right">
                              Dispense Desk
                            </Button>
                          </Link>
                        </>
                      )}

                      {(item.status === 'dispensed' || item.status === 'completed') && (
                        <span className="col-span-2 sm:col-span-1 w-full sm:w-auto text-xs font-semibold text-[var(--green-800)] bg-[var(--success-bg)] px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] rounded-[var(--r-control)] border border-[var(--success)] flex items-center justify-center gap-1">
                          <CheckCircle size={14} /> Completed
                        </span>
                      )}

                      {/* Individual Delete Button */}
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmTarget({ type: 'single', visit: item, visitIds: [item.id] })}
                        className="col-span-2 sm:col-span-1 h-9 sm:h-8 px-2 sm:px-2 rounded-[var(--r-control)] text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors flex items-center justify-center gap-1 cursor-pointer touch-manipulation text-xs font-medium"
                        title={`Delete visit for ${item.patientName}`}
                        aria-label={`Delete visit for ${item.patientName}`}
                      >
                        <Trash2 size={14} />
                        <span className="sm:hidden">Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div
          onClick={() => {
            if (!isDeleting) setDeleteConfirmTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-[var(--line-soft)] shadow-xl max-w-md w-full p-5 space-y-4 animate-scaleUp"
          >
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-[var(--text-strong)] leading-snug">
                  {deleteConfirmTarget.type === 'single'
                    ? `Delete Visit for ${deleteConfirmTarget.visit?.patientName || 'Patient'}?`
                    : `Delete ${deleteConfirmTarget.visitIds.length} Patient Visit${deleteConfirmTarget.visitIds.length > 1 ? 's' : ''}?`}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  {deleteConfirmTarget.type === 'single' && deleteConfirmTarget.visit ? (
                    <>
                      Are you sure you want to delete token{' '}
                      <strong className="text-[var(--text-strong)]">
                        #{String(deleteConfirmTarget.visit.token_number).padStart(2, '0')}
                      </strong>{' '}
                      for <strong className="text-[var(--text-strong)]">{deleteConfirmTarget.visit.patientName}</strong> (UHID: {deleteConfirmTarget.visit.patientUhid})?
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete{' '}
                      <strong className="text-[var(--text-strong)]">
                        {deleteConfirmTarget.visitIds.length} selected visit{deleteConfirmTarget.visitIds.length > 1 ? 's' : ''}
                      </strong>{' '}
                      from the queue?
                    </>
                  )}
                  <br />
                  <span className="text-rose-600 font-medium block mt-1">
                    This will remove the record from the OPD Reception Queue, Doctor Queue, and Pharmacy Queue.
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line-soft)]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!isDeleting) setDeleteConfirmTarget(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-[var(--r-control)] bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
