'use client';

import { useState, useMemo } from 'react';
import { Clock, ChevronRight, Stethoscope, CheckCircle, FileText, User } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useAuth } from '@/lib/auth/context';
import { useVisits, usePatients, useDoctors } from '@/lib/query/hooks';
import { clsx } from 'clsx';

type Tab = 'queue' | 'completed';

export default function DoctorPage() {
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const [tab, setTab] = useState<Tab>('queue');

  // If logged in as Doctor, lock to current doctor id. If admin, allow switching doctor view.
  const isDoctor = user?.role === 'doctor';
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    user?.doctorId || user?.id || doctors[0]?.id || ''
  );

  const activeDoctorId = isDoctor ? user?.doctorId || user?.id : selectedDoctorId;
  const currentDoctorObj = doctors.find(
    (d) =>
      d.id === activeDoctorId ||
      d.user_id === activeDoctorId ||
      (user?.id && (d.id === user.id || d.user_id === user.id)) ||
      (user?.email && d.user?.email === user.email)
  );

  const currentDoctor = {
    full_name: currentDoctorObj?.user?.full_name || currentDoctorObj?.full_name || user?.fullName || 'Doctor',
    specialization: currentDoctorObj?.specialization || user?.specialization || 'Consultant',
    consultation_room: currentDoctorObj?.consultation_room || user?.consultationRoom || 'OPD Room',
  };

  // Collect all valid IDs belonging to this doctor (UUID unification)
  const doctorIdSet = useMemo(() => {
    const set = new Set<string>();
    if (activeDoctorId) set.add(activeDoctorId);
    if (user?.id) set.add(user.id);
    if (user?.doctorId) set.add(user.doctorId);
    if (currentDoctorObj?.id) set.add(currentDoctorObj.id);
    if (currentDoctorObj?.user_id) set.add(currentDoctorObj.user_id);
    return set;
  }, [activeDoctorId, user?.id, user?.doctorId, currentDoctorObj?.id, currentDoctorObj?.user_id]);

  // Memoized O(1) patient map and single-pass visit enrichment
  const { waitingQueue, completedQueue } = useMemo(() => {
    // 1. Precompute patient visit counts in O(V)
    const patientVisitCountMap = new Map<string, number>();
    visits.forEach((v) => {
      patientVisitCountMap.set(v.patient_id, (patientVisitCountMap.get(v.patient_id) || 0) + 1);
    });

    // 2. Precompute patient lookup map in O(P)
    const patientMap = new Map<string, (typeof patients)[0]>();
    patients.forEach((p) => patientMap.set(p.id, p));

    // 3. Filter visits belonging to doctor
    const doctorVisits = visits.filter((v) => {
      if (!v.doctor_id) return isDoctor && doctors.length <= 1;
      return doctorIdSet.has(v.doctor_id);
    });

    const waiting: any[] = [];
    const completed: any[] = [];

    doctorVisits.forEach((v) => {
      const patient = patientMap.get(v.patient_id);
      const totalVisits = patientVisitCountMap.get(v.patient_id) || 1;
      const pastCount = Math.max(0, totalVisits - 1);
      const enriched = {
        ...v,
        patientName: patient?.name || 'Patient',
        patientAge: patient?.age || 0,
        patientUhid: patient?.uhid || '—',
        patientPhone: patient?.phone || '—',
        hasBP: patient?.has_bp || false,
        hasSugar: patient?.has_sugar || false,
        otherConditions: patient?.other_conditions || '',
        pastVisits: pastCount,
      };

      if (v.status === 'waiting' || v.status === 'in_consultation') {
        waiting.push(enriched);
      } else if (v.status === 'prescribed' || v.status === 'dispensed' || v.status === 'completed') {
        completed.push(enriched);
      }
    });

    waiting.sort((a, b) => a.token_number - b.token_number);
    completed.sort((a, b) => a.token_number - b.token_number);

    return { waitingQueue: waiting, completedQueue: completed };
  }, [visits, patients, doctorIdSet, isDoctor, doctors.length]);

  const activeList = tab === 'queue' ? waitingQueue : completedQueue;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl lg:text-[40px] leading-tight font-medium text-[var(--text-strong)] tracking-[-0.02em]">
            Doctor Consultation Queue
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-[var(--green-700)]">{currentDoctor.full_name}</span>
            <span>·</span>
            <span>{currentDoctor.specialization}</span>
            <span>·</span>
            <span>{currentDoctor.consultation_room}</span>
          </p>
        </div>

        {/* If Admin, show doctor selector */}
        {user?.role === 'admin' && (
          <div className="flex items-center gap-2 bg-white rounded-[var(--r-control)] p-1.5 border border-[var(--line-soft)] shadow-sm">
            <span className="text-xs text-[var(--text-muted)] px-2">Viewing Doctor:</span>
            <select
              value={activeDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="text-xs font-medium text-[var(--text-strong)] bg-transparent focus:outline-none pr-3"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.specialization})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pill Tab Switcher */}
      <div className="flex gap-1 bg-white rounded-[var(--r-pill)] p-1 w-fit shadow-[var(--shadow-float)] mb-5">
        {[
          { id: 'queue' as Tab, label: 'Waiting in Queue', count: waitingQueue.length },
          { id: 'completed' as Tab, label: "Today's Consulted", count: completedQueue.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-[var(--r-pill)] text-sm font-medium transition-all duration-150',
              tab === t.id
                ? 'bg-[var(--green-600)] text-white'
                : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
            )}
          >
            {t.label}
            <span
              className={clsx(
                'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-medium',
                tab === t.id ? 'bg-white/20 text-white' : 'bg-[var(--bg-tile)] text-[var(--text-muted)]'
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Queue Card */}
      <Card>
        <CardHeader
          title={tab === 'queue' ? 'Patients Waiting for You' : 'Completed Consultations'}
          count={activeList.length}
        />

        {activeList.length === 0 ? (
          <EmptyState
            icon={<Stethoscope size={24} />}
            title={tab === 'queue' ? 'Queue is clear' : 'No patients consulted yet'}
            description={
              tab === 'queue'
                ? `Patients assigned to ${currentDoctor.full_name} by reception will appear here immediately.`
                : 'Consulted patients and their prescribed medications will be listed here.'
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeList.map((p) => {
              const timeStr = new Date(p.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3.5 bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3.5 sm:p-4 min-h-[72px]"
                >
                  {/* Token */}
                  <div className="shrink-0 w-12 text-center bg-white rounded-[var(--r-control)] py-1.5 border border-[var(--line-soft)]">
                    <p className="text-[20px] leading-none font-semibold text-[var(--text-strong)]">
                      {String(p.token_number).padStart(2, '0')}
                    </p>
                    <p className="text-[9px] text-[var(--text-faint)] mt-0.5">{timeStr}</p>
                  </div>

                  <div className="w-px h-10 bg-[var(--line-soft)] shrink-0 hidden sm:block" />

                  {/* Avatar + Info */}
                  <Avatar name={p.patientName} size="md" className="shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--text-strong)]">{p.patientName}</span>
                      <span className="text-xs text-[var(--text-muted)]">{p.patientAge}y</span>
                      {p.hasBP && <StatusPill variant="warning" label="BP" />}
                      {p.hasSugar && <StatusPill variant="info" label="Sugar" />}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)] flex-wrap">
                      <span className="font-mono text-[var(--text-strong)]">{p.patientUhid}</span>
                      <span>·</span>
                      <span>Visit: {p.visit_number}</span>
                      {p.pastVisits > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--green-700)] font-medium">
                            {p.pastVisits} past visit{p.pastVisits !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                      {p.otherConditions && (
                        <>
                          <span>·</span>
                          <span className="italic truncate max-w-xs">{p.otherConditions}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0 flex items-center gap-2">
                    {tab === 'queue' ? (
                      <>
                        {p.status === 'in_consultation' ? (
                          <span className="text-[11px] bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full border border-blue-300 animate-pulse">
                            In Consultation
                          </span>
                        ) : (
                          <span className="text-[11px] bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full border border-amber-200">
                            Waiting in Lobby
                          </span>
                        )}
                        <Link
                          href={`/doctor/prescribe?visitId=${p.id}&patientId=${p.patient_id}&token=${p.token_number}&name=${encodeURIComponent(
                            p.patientName
                          )}&uhid=${p.patientUhid}&age=${p.patientAge}&doctorId=${activeDoctorId}`}
                        >
                          <Button
                            size="sm"
                            className={p.status === 'in_consultation' ? 'bg-[var(--green-900)] text-white' : ''}
                            icon={<ChevronRight size={14} />}
                            iconPosition="right"
                          >
                            {p.status === 'in_consultation' ? 'Resume Consultation' : 'Start Consultation'}
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        {p.status === 'prescribed' ? (
                          <span className="text-[11px] bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-full border border-amber-300">
                            💊 At Pharmacy (Pending Dispense)
                          </span>
                        ) : (
                          <span className="text-[11px] bg-emerald-100 text-emerald-900 font-bold px-2.5 py-1 rounded-full border border-emerald-300">
                            ✅ Dispensed by Pharmacy
                          </span>
                        )}
                        <Link
                          href={`/doctor/prescribe?visitId=${p.id}&patientId=${p.patient_id}&token=${p.token_number}&name=${encodeURIComponent(
                            p.patientName
                          )}&uhid=${p.patientUhid}&age=${p.patientAge}&doctorId=${activeDoctorId}`}
                        >
                          <Button size="sm" variant="secondary" icon={<FileText size={13} />}>
                            View Rx
                          </Button>
                        </Link>
                      </div>
                    )}
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
