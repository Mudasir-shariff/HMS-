'use client';

import { useState, useMemo } from 'react';
import { Clock, ChevronRight, Stethoscope, CheckCircle, FileText, User, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, StatusPill, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useAuth } from '@/lib/auth/context';
import { useVisits, usePatients, useDoctors, usePrescriptions } from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { broadcastChange } from '@/lib/realtime/realtime-provider';
import { isTodayOrWithin24Hours } from '@/lib/utils/date';
import type { Visit } from '@/lib/types/database';
import { clsx } from 'clsx';

type Tab = 'queue' | 'completed';

export default function DoctorPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const { data: prescriptions = [] } = usePrescriptions();
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

    // 3. Precompute prescribed visit IDs to guarantee zero ghost patients in waiting queue
    const prescribedVisitIds = new Set(prescriptions.map((rx) => rx.visit_id).filter(Boolean));

    // 4. Filter visits belonging to doctor
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

      const isAlreadyPrescribed =
        v.status === 'completed' ||
        v.status === 'prescribed' ||
        v.status === 'dispensed' ||
        prescribedVisitIds.has(v.id);

      if (isAlreadyPrescribed) {
        // Only show today's consulted patients (disappears after 24 hours)
        if (isTodayOrWithin24Hours(v.updated_at || v.created_at)) {
          completed.push({
            ...enriched,
            status: 'completed',
          });
        }
      } else if (v.status === 'waiting' || v.status === 'in_consultation') {
        // Doctor queue: show today's / active patients (within 24 hours)
        if (isTodayOrWithin24Hours(v.created_at)) {
          waiting.push(enriched);
        }
      }
    });

    waiting.sort((a, b) => a.token_number - b.token_number);
    completed.sort((a, b) => a.token_number - b.token_number);

    return { waitingQueue: waiting, completedQueue: completed };
  }, [visits, patients, prescriptions, doctorIdSet, isDoctor, doctors.length]);

  // When doctor calls a new patient, auto-complete any previous in_consultation visit
  const handleStartConsultation = async (targetVisit: any) => {
    const activeDocId = isDoctor ? user?.doctorId || user?.id : selectedDoctorId;
    const prevInConsultation = visits.filter(
      (v) => (v.doctor_id === activeDocId || !v.doctor_id) && v.id !== targetVisit.id && v.status === 'in_consultation'
    );

    if (prevInConsultation.length > 0) {
      queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
        old ? old.map((v) => (prevInConsultation.some((p) => p.id === v.id) ? { ...v, status: 'completed' } : v)) : []
      );
      for (const prev of prevInConsultation) {
        broadcastChange('visit_updated', { visit: { id: prev.id, status: 'completed' } });
      }
      try {
        const supabase = createClient();
        for (const prev of prevInConsultation) {
          supabase
            .from('visits')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', prev.id)
            .then(() => {});
        }
      } catch (err) {
        console.warn('Auto-completing previous visit warning:', err);
      }
    }

    broadcastChange('visit_updated', { visit: { id: targetVisit.id, status: 'in_consultation' } });

    router.push(
      `/doctor/prescribe?visitId=${targetVisit.id}&patientId=${targetVisit.patient_id}&token=${targetVisit.token_number}&name=${encodeURIComponent(
        targetVisit.patientName
      )}&uhid=${targetVisit.patientUhid}&age=${targetVisit.patientAge}&doctorId=${activeDoctorId}`
    );
  };

  const activeList = tab === 'queue' ? waitingQueue : completedQueue;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold font-[family-name:var(--font-heading)] text-[var(--text-strong)] tracking-tight">
            Doctor Consultation Queue
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[var(--green-700)]">{currentDoctor.full_name}</span>
            <span>·</span>
            <span>{currentDoctor.specialization}</span>
            <span>·</span>
            <span>{currentDoctor.consultation_room}</span>
          </p>
        </div>

        {/* If Admin, show doctor selector */}
        {user?.role === 'admin' && (
          <div className="flex items-center gap-2 bg-white rounded-[var(--r-control)] p-1.5 border border-[var(--line-soft)] shadow-xs">
            <span className="text-xs text-[var(--text-muted)] px-2">Viewing Doctor:</span>
            <select
              value={activeDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="text-base sm:text-xs font-medium text-[var(--text-strong)] bg-transparent focus:outline-none pr-3 min-h-[38px] sm:min-h-0"
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
      <div className="flex gap-1.5 bg-white rounded-[var(--r-pill)] p-1.5 w-full sm:w-fit shadow-[var(--shadow-float)] mb-5 overflow-x-auto no-scrollbar snap-x border border-[var(--line-soft)]">
        {[
          { id: 'queue' as Tab, label: 'Waiting in Queue', count: waitingQueue.length },
          { id: 'completed' as Tab, label: "Today's Consulted", count: completedQueue.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-[var(--r-pill)] text-xs sm:text-sm font-semibold transition-all duration-150 shrink-0 min-h-[40px] snap-start touch-manipulation cursor-pointer',
              tab === t.id
                ? 'bg-[var(--green-600)] text-white shadow-xs'
                : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
            )}
          >
            {t.label}
            <span
              className={clsx(
                'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-bold tabular-nums',
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
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-[var(--r-tile)] p-3.5 sm:p-4 border border-[var(--line-soft)] hover:border-[var(--green-600)]/50 hover:shadow-subtle transition-all"
                >
                  {/* Left: Token + Avatar + Info */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    {/* Token */}
                    <div className="shrink-0 w-14 text-center bg-[var(--sage-100)] rounded-[var(--r-tile)] py-2 px-1 border-2 border-[var(--green-600)] shadow-2xs">
                      <p className="text-[22px] leading-none font-black text-[var(--green-900)] tabular-nums">
                        {String(p.token_number).padStart(2, '0')}
                      </p>
                      <p className="text-[9px] text-[var(--green-700)] mt-1 font-bold">{timeStr}</p>
                    </div>

                    <div className="w-px h-10 bg-[var(--line-soft)] shrink-0 hidden sm:block" />

                    {/* Avatar + Info */}
                    <Avatar name={p.patientName} size="md" className="shrink-0 hidden xs:flex" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-[var(--text-strong)] leading-tight">{p.patientName}</span>
                        <span className="text-xs text-[var(--text-muted)] font-medium tabular-nums">{p.patientAge}y</span>
                        {p.hasBP && <StatusPill variant="warning" label="BP" />}
                        {p.hasSugar && <StatusPill variant="info" label="Sugar" />}
                      </div>

                      <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                        <span className="font-mono font-semibold text-[var(--text-strong)]">{p.patientUhid}</span>
                        <span>·</span>
                        <span>Visit: {p.visit_number}</span>
                        {p.pastVisits > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-[var(--green-700)] font-bold">
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
                  </div>

                  {/* Action */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]">
                    {tab === 'queue' ? (
                      <>
                        <div className="flex items-center justify-between sm:justify-start gap-2">
                          {p.status === 'in_consultation' ? (
                            <span className="text-xs bg-[#F0F9FF] text-[#075985] font-bold px-3 py-1 rounded-full border border-[#BAE6FD]">
                              ● In Consultation
                            </span>
                          ) : (
                            <span className="text-xs bg-[#FFFBEB] text-[#92400E] font-semibold px-2.5 py-1 rounded-full border border-[#FDE68A]">
                              Waiting in Lobby
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleStartConsultation(p)}
                          className={`w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[38px] font-semibold shadow-xs ${p.status === 'in_consultation' ? 'bg-[var(--green-900)] text-white' : ''}`}
                          icon={<ChevronRight size={14} />}
                          iconPosition="right"
                        >
                          {p.status === 'in_consultation' ? 'Resume Consultation' : 'Start Consultation'}
                        </Button>
                      </>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
                        <div className="flex items-center justify-between sm:justify-start gap-2">
                          <span className="text-xs bg-[#ECFDF5] text-[#065F46] font-bold px-3 py-1 rounded-full border border-[#A7F3D0]">
                            ✅ Completed
                          </span>
                        </div>
                        <Link
                          href={`/doctor/prescribe?visitId=${p.id}&patientId=${p.patient_id}&token=${p.token_number}&name=${encodeURIComponent(
                            p.patientName
                          )}&uhid=${p.patientUhid}&age=${p.patientAge}&doctorId=${activeDoctorId}`}
                          className="w-full sm:w-auto"
                        >
                          <Button size="sm" variant="secondary" className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[38px] font-semibold" icon={<FileText size={13} />}>
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
