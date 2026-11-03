'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, SearchInput, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useHMSStore } from '@/lib/store/use-store';
import { HMSStore } from '@/lib/store/hms-store';
import { useAuth } from '@/lib/auth/context';
import type { VisitStatus } from '@/lib/types/database';
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
  const { user } = useAuth();
  const { visits, patients, doctors } = useHMSStore();
  const [search, setSearch] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  }

  // Today's visits mapped with patient and doctor details (strictly sorted by Token ascending)
  const todayVisits = visits
    .map((v) => {
      const patient = patients.find((p) => p.id === v.patient_id);
      const doc = doctors.find((d) => d.id === v.doctor_id || (d as any).user_id === v.doctor_id);
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

  const waitingOnly = todayVisits.filter((v) => v.status === 'waiting').length;
  const consultingOnly = todayVisits.filter((v) => v.status === 'in_consultation').length;
  const pharmacyOnly = todayVisits.filter((v) => v.status === 'prescribed').length;
  const dispensedOnly = todayVisits.filter((v) => v.status === 'dispensed' || v.status === 'completed').length;
  const countWaitingTotal = waitingOnly + consultingOnly;

  const filtered = todayVisits
    .filter((v) => {
      const matchesSearch =
        v.patientName.toLowerCase().includes(search.toLowerCase()) ||
        v.patientPhone.includes(search) ||
        v.patientUhid.toLowerCase().includes(search.toLowerCase()) ||
        v.visit_number.toLowerCase().includes(search.toLowerCase());

      const matchesDoc = doctorFilter === 'all' || v.doctor_id === doctorFilter;

      let matchesStage = true;
      if (stageFilter === 'with_doctor') matchesStage = v.status === 'waiting' || v.status === 'in_consultation';
      else if (stageFilter === 'waiting') matchesStage = v.status === 'waiting';
      else if (stageFilter === 'in_consultation') matchesStage = v.status === 'in_consultation';
      else if (stageFilter === 'prescribed') matchesStage = v.status === 'prescribed';
      else if (stageFilter === 'dispensed') matchesStage = v.status === 'dispensed' || v.status === 'completed';

      return matchesSearch && matchesDoc && matchesStage;
    })
    .sort((a, b) => a.token_number - b.token_number);

  // Action: Direct status transition on a specific row
  function handleMoveToCabin(visitId: string, token: number) {
    HMSStore.updateVisitStatus(visitId, 'in_consultation');
    triggerToast(`Token #${String(token).padStart(2, '0')} called into Doctor Consultation Cabin.`);
  }

  function handleSendToPharmacy(visitId: string, token: number) {
    HMSStore.updateVisitStatus(visitId, 'prescribed');
    triggerToast(`Prescription saved. Token #${String(token).padStart(2, '0')} moved to Pharmacy Dispensing Queue.`);
  }

  function handleQuickDeliver(visitId: string, token: number) {
    HMSStore.quickDeliverVisit(visitId, user?.fullName || 'Pharmacist on Duty');
    triggerToast(`Token #${String(token).padStart(2, '0')} marked as Delivered! Pharmacy inventory auto-deducted.`);
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
            subtext: `${waitingOnly} in lobby queue · ${consultingOnly} in cabin`,
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
                'rounded-[var(--r-tile)] p-4 flex items-center justify-between gap-3 text-left transition-all duration-150 cursor-pointer border',
                isSelected
                  ? 'bg-white border-2 border-[var(--green-700)] shadow-[var(--shadow-float)] ring-2 ring-[var(--green-600)]/20'
                  : 'bg-[var(--bg-card)] border-[var(--line-soft)] hover:border-[var(--green-600)]/60 hover:bg-white hover:shadow-xs'
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={clsx(
                    'h-10 w-10 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors',
                    isSelected
                      ? 'border-[var(--green-700)] bg-[var(--sage-100)] text-[var(--green-800)]'
                      : 'border-[var(--line-soft)] bg-white text-[var(--text-muted)]'
                  )}
                >
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className={clsx('text-[26px] leading-none font-bold tracking-tight', t.color)}>
                      {t.value}
                    </p>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-[var(--green-800)] bg-[var(--sage-100)] px-1.5 py-0.5 rounded-full border border-[var(--green-600)]/30">
                        Active Filter
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-[var(--text-strong)] mt-1 truncate">{t.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{t.subtext}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Doctor Cabins Live Load Monitor */}
      <div className="mb-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {doctors.map((doc) => {
              const docWaiting = todayVisits.filter((v) => v.doctor_id === doc.id && v.status === 'waiting').length;
              const docInConsult = todayVisits.filter((v) => v.doctor_id === doc.id && v.status === 'in_consultation').length;
              const docDone = todayVisits.filter(
                (v) => v.doctor_id === doc.id && (v.status === 'prescribed' || v.status === 'dispensed')
              ).length;

              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-[var(--r-tile)] p-3.5 border border-[var(--line-soft)] shadow-xs flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-xs text-[var(--text-strong)]">{doc.full_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {doc.specialization} · <strong>{doc.consultation_room}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-right">
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
            <div className="flex items-center gap-2 flex-wrap">
              {/* Doctor filter dropdown */}
              <select
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                className="h-9 rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] px-3 text-xs text-[var(--text-body)] focus:outline-none focus:border-[var(--green-600)]"
              >
                <option value="all">All Doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} ({d.specialization})
                  </option>
                ))}
              </select>

              {/* Stage filter pills */}
              <div className="flex gap-1 bg-[var(--bg-canvas)] rounded-[var(--r-pill)] p-0.5 border border-[var(--line-soft)] text-xs">
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
                      'px-2.5 py-1 rounded-[var(--r-pill)] font-medium transition-all',
                      stageFilter === s.id
                        ? 'bg-[var(--green-900)] text-white shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search patient, phone, UHID..."
                className="w-44 sm:w-56"
              />
            </div>
          }
        />

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
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--bg-tile)] rounded-[var(--r-tile)] px-4 py-3 min-h-[68px] border border-[var(--line-soft)]/60 hover:border-[var(--green-600)]/40 hover:bg-white transition-all shadow-xs"
                >
                  {/* Left: Patient Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Token Number */}
                    <div className="shrink-0 h-12 w-12 rounded-full bg-[var(--sage-100)] flex flex-col items-center justify-center border-2 border-[var(--green-600)] shadow-xs">
                      <span className="text-base font-bold text-[var(--green-900)] leading-none">
                        {String(item.token_number).padStart(2, '0')}
                      </span>
                      <span className="text-[8px] font-bold text-[var(--green-700)] mt-0.5 tracking-wider">TOKEN</span>
                    </div>

                    <Avatar name={item.patientName} size="md" className="shrink-0" />

                    {/* Patient Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-strong)]">{item.patientName}</span>
                        <span className="text-xs text-[var(--text-muted)]">{item.patientAge} yrs</span>
                        {item.hasBP && <StatusPill variant="warning" label="BP" />}
                        {item.hasSugar && <StatusPill variant="info" label="Sugar" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)] flex-wrap">
                        <span className="font-mono font-medium text-[var(--text-strong)]">{item.patientUhid}</span>
                        <span>·</span>
                        <span>Phone: {item.patientPhone}</span>
                        <span>·</span>
                        <span className="font-medium text-[var(--green-800)]">
                          {item.doctorName} ({item.doctorRoom})
                        </span>
                        <span>·</span>
                        <span>Time: {timeStr}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Pipeline Stepper & Interactive Action Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 self-end lg:self-auto">
                    {/* 3-Step Journey Pipeline Stepper */}
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-[var(--r-control)] border border-[var(--line-soft)] text-[11px]">
                      {/* Step 1: Reception */}
                      <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold">
                        <CheckCircle size={12} /> Reception
                      </span>

                      <span className="text-[var(--text-faint)]">→</span>

                      {/* Step 2: Doctor */}
                      {item.status === 'waiting' && (
                        <span className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                          <Clock size={11} /> Dr. Queue
                        </span>
                      )}
                      {item.status === 'in_consultation' && (
                        <span className="flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded animate-pulse">
                          <Stethoscope size={11} /> In Cabin
                        </span>
                      )}
                      {(item.status === 'prescribed' || item.status === 'dispensed' || item.status === 'completed') && (
                        <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold">
                          <CheckCircle size={12} /> Doctor Done
                        </span>
                      )}

                      <span className="text-[var(--text-faint)]">→</span>

                      {/* Step 3: Pharmacy */}
                      {item.status === 'prescribed' && (
                        <span className="flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded animate-pulse">
                          <Pill size={11} /> Pharmacy Queue
                        </span>
                      )}
                      {(item.status === 'dispensed' || item.status === 'completed') && (
                        <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold">
                          <CheckCircle size={12} /> Dispensed
                        </span>
                      )}
                      {(item.status === 'waiting' || item.status === 'in_consultation') && (
                        <span className="text-[var(--text-faint)]">Pharmacy</span>
                      )}
                    </div>

                    {/* Stage-Specific 1-Click Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      {item.status === 'waiting' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMoveToCabin(item.id, item.token_number)}
                            className="text-xs font-semibold px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-[var(--r-control)] border border-blue-200 transition-colors flex items-center gap-1"
                            title="Call patient into doctor consultation room"
                          >
                            <Stethoscope size={13} />
                            Call into Cabin
                          </button>
                          <Link
                            href={`/doctor/prescribe?visitId=${item.id}&patientId=${item.patient_id}&token=${item.token_number}&name=${encodeURIComponent(
                              item.patientName
                            )}`}
                          >
                            <Button size="sm" variant="secondary" icon={<ChevronRight size={13} />} iconPosition="right">
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
                            className="text-xs font-semibold px-2.5 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-[var(--r-control)] border border-purple-200 transition-colors flex items-center gap-1"
                            title="Complete doctor visit and send patient to pharmacy queue"
                          >
                            <Pill size={13} />
                            Send to Pharmacy
                          </button>
                          <Link
                            href={`/doctor/prescribe?visitId=${item.id}&patientId=${item.patient_id}&token=${item.token_number}&name=${encodeURIComponent(
                              item.patientName
                            )}`}
                          >
                            <Button size="sm" icon={<ChevronRight size={13} />} iconPosition="right">
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
                            className="text-xs font-semibold px-3 py-1.5 bg-[var(--green-900)] text-white hover:bg-[var(--green-800)] rounded-[var(--r-control)] shadow-xs transition-colors flex items-center gap-1"
                            title="Confirm delivery of prescribed medicines & deduct inventory"
                          >
                            <Check size={13} />
                            Mark Delivered
                          </button>
                          <Link
                            href={`/pharmacy/dispense?visitId=${item.id}&token=${item.token_number}`}
                          >
                            <Button size="sm" variant="secondary" icon={<ChevronRight size={13} />} iconPosition="right">
                              Dispense Desk
                            </Button>
                          </Link>
                        </>
                      )}

                      {(item.status === 'dispensed' || item.status === 'completed') && (
                        <span className="text-xs font-semibold text-[var(--green-800)] bg-[var(--success-bg)] px-2.5 py-1.5 rounded-[var(--r-control)] border border-[var(--success)] flex items-center gap-1">
                          <CheckCircle size={13} /> Completed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
