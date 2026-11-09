'use client';

import { useState, useMemo, useEffect } from 'react';
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
  Calendar,
  MessageSquare,
  Send,
  CalendarCheck,
  CalendarClock,
  AlertTriangle,
  UserCheck,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  X,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, SearchInput, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useVisits, usePatients, useDoctors, useHospitalSettings } from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { deleteVisitsFromSupabase } from '@/lib/supabase/sync';
import { broadcastChange } from '@/lib/realtime/realtime-provider';
import {
  isTodayOrWithin24Hours,
  categorizeFollowUpDate,
  formatFollowUpDisplay,
  getDaysDifference,
  parseLocalDate,
  type FollowUpCategory,
} from '@/lib/utils/date';
import {
  buildFollowUpWhatsAppMessage,
  generateWhatsAppUrl,
} from '@/lib/utils/whatsapp';
import { formatPhoneDisplay, cleanIndianPhone } from '@/lib/utils/validation';
import { recordAuditLog } from '@/lib/audit/logger';
import { useAuth } from '@/lib/auth/context';
import type { VisitStatus, Visit } from '@/lib/types/database';
import { clsx } from 'clsx';

type StageFilter = 'all' | 'with_doctor' | 'waiting' | 'in_consultation' | 'completed';
type ReceptionTab = 'queue' | 'follow_ups';
type FollowUpTimeframe = 'tomorrow' | 'today' | 'upcoming' | 'overdue' | 'all';
type ReminderStatusFilter = 'all' | 'pending' | 'sent' | 'confirmed';

interface ReminderRecord {
  status: 'pending' | 'sent' | 'confirmed' | 'rescheduled' | 'cancelled';
  sentAt?: string;
  notes?: string;
}

const statusMap: Record<VisitStatus, { variant: 'info' | 'success' | 'danger' | 'warning'; label: string }> = {
  waiting: { variant: 'warning', label: 'In Doctor Queue' },
  in_consultation: { variant: 'info', label: 'In Consultation' },
  completed: { variant: 'success', label: 'Completed' },
  prescribed: { variant: 'success', label: 'Completed' },
  dispensed: { variant: 'success', label: 'Completed' },
};

export default function ReceptionPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const { data: hospitalSettings } = useHospitalSettings();

  // Top Section Selector: OPD Queue vs Follow-up Reminders
  const [activeTab, setActiveTab] = useState<ReceptionTab>('queue');

  // OPD Queue Filters
  const [search, setSearch] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Follow-up Reminders Sub-Filters
  const [timeframeFilter, setTimeframeFilter] = useState<FollowUpTimeframe>('tomorrow');
  const [reminderFilter, setReminderFilter] = useState<ReminderStatusFilter>('all');
  const [followUpDoctorFilter, setFollowUpDoctorFilter] = useState('all');
  const [followUpSearch, setFollowUpSearch] = useState('');

  // Follow-up Reminder Status Tracking (persisted to localStorage)
  const [reminderStatuses, setReminderStatuses] = useState<Record<string, ReminderRecord>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('hms_follow_up_reminders');
        if (stored) {
          setReminderStatuses(JSON.parse(stored));
        }
      } catch {}
    }
  }, []);

  function saveReminderStatus(visitId: string, status: ReminderRecord['status'], extra?: { sentAt?: string; notes?: string }) {
    setReminderStatuses((prev) => {
      const updated = {
        ...prev,
        [visitId]: {
          ...(prev[visitId] || {}),
          status,
          sentAt: extra?.sentAt || (status === 'sent' ? new Date().toISOString() : prev[visitId]?.sentAt),
          notes: extra?.notes ?? prev[visitId]?.notes,
        },
      };
      try {
        localStorage.setItem('hms_follow_up_reminders', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

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

  // -------------------------------------------------------------
  // OPD Queue Memoized Calculations
  // -------------------------------------------------------------
  const { todayVisits, waitingOnly, consultingOnly, completedOnly, countWaitingTotal } = useMemo(() => {
    const patientMap = new Map<string, (typeof patients)[0]>();
    patients.forEach((p) => patientMap.set(p.id, p));

    const doctorMap = new Map<string, (typeof doctors)[0]>();
    doctors.forEach((d) => {
      doctorMap.set(d.id, d);
      if (d.user_id) doctorMap.set(d.user_id, d);
    });

    const tv = visits
      .filter((v) => isTodayOrWithin24Hours(v.created_at))
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

    let w = 0, c = 0, done = 0;
    tv.forEach((v) => {
      if (v.status === 'waiting') w++;
      else if (v.status === 'in_consultation') c++;
      else done++;
    });

    return {
      todayVisits: tv,
      waitingOnly: w,
      consultingOnly: c,
      completedOnly: done,
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
        else if (stageFilter === 'completed') matchesStage = v.status === 'completed' || (v.status as any) === 'dispensed' || (v.status as any) === 'prescribed';

        return matchesSearch && matchesDoc && matchesStage;
      })
      .sort((a, b) => a.token_number - b.token_number);
  }, [todayVisits, search, doctorFilter, stageFilter]);

  // -------------------------------------------------------------
  // Follow-up Management Memoized Calculations
  // -------------------------------------------------------------
  const allFollowUps = useMemo(() => {
    const patientMap = new Map<string, (typeof patients)[0]>();
    patients.forEach((p) => patientMap.set(p.id, p));

    const doctorMap = new Map<string, (typeof doctors)[0]>();
    doctors.forEach((d) => {
      doctorMap.set(d.id, d);
      if (d.user_id) doctorMap.set(d.user_id, d);
    });

    // 1. Gather all visits that have follow_up_date
    const list = visits
      .filter((v) => Boolean(v.follow_up_date))
      .map((v) => {
        const patient = patientMap.get(v.patient_id);
        const doc = doctorMap.get(v.doctor_id);
        const followUpDateStr = v.follow_up_date!;
        const diff = getDaysDifference(followUpDateStr);
        const category = categorizeFollowUpDate(followUpDateStr);

        return {
          id: v.id,
          visit_number: v.visit_number,
          patient_id: v.patient_id,
          patientName: patient?.name || 'Unknown Patient',
          patientUhid: patient?.uhid || '—',
          patientPhone: patient?.phone || '—',
          patientAge: patient?.age || 0,
          bloodGroup: patient?.blood_group,
          hasBP: patient?.has_bp || false,
          hasSugar: patient?.has_sugar || false,
          doctorId: v.doctor_id,
          doctorName: doc?.full_name || 'Dr. Assigned',
          doctorSpec: doc?.specialization || 'OPD General',
          doctorRoom: doc?.consultation_room || 'Cabin 1',
          followUpDate: followUpDateStr,
          daysDifference: diff,
          category,
          instructions: v.instructions || '',
          created_at: v.created_at,
          status: v.status,
        };
      });

    // 2. If no visits currently carry follow_up_date (e.g. initial start),
    // provide realistic demo follow-ups using existing patients/doctors
    if (list.length === 0 && patients.length > 0) {
      const tomorrowStr = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      const todayStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      const in3DaysStr = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      const p0 = patients[0];
      const p1 = patients[1] || patients[0];
      const p2 = patients[2] || patients[0];
      const d0 = doctors[0] || { full_name: 'Dr. Priya Sharma', specialization: 'General Physician', consultation_room: 'Cabin 1', id: 'doc-1' };
      const d1 = doctors[1] || d0;

      return [
        {
          id: 'demo-followup-1',
          visit_number: 'V-DEMO-1',
          patient_id: p0.id,
          patientName: p0.name,
          patientUhid: p0.uhid,
          patientPhone: p0.phone,
          patientAge: p0.age,
          bloodGroup: p0.blood_group,
          hasBP: p0.has_bp,
          hasSugar: p0.has_sugar,
          doctorId: d0.id,
          doctorName: d0.full_name || 'Dr. Priya Sharma',
          doctorSpec: d0.specialization || 'General Physician',
          doctorRoom: d0.consultation_room || 'Cabin 1',
          followUpDate: tomorrowStr,
          daysDifference: 1,
          category: 'tomorrow' as const,
          instructions: 'Check fasting BP & pulse rate. Review morning medications.',
          created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
          status: 'completed' as const,
        },
        {
          id: 'demo-followup-2',
          visit_number: 'V-DEMO-2',
          patient_id: p1.id,
          patientName: p1.name,
          patientUhid: p1.uhid,
          patientPhone: p1.phone,
          patientAge: p1.age,
          bloodGroup: p1.blood_group,
          hasBP: p1.has_bp,
          hasSugar: p1.has_sugar,
          doctorId: d1.id,
          doctorName: d1.full_name || 'Dr. Assigned',
          doctorSpec: d1.specialization || 'Cardiology',
          doctorRoom: d1.consultation_room || 'Cabin 2',
          followUpDate: todayStr,
          daysDifference: 0,
          category: 'today' as const,
          instructions: 'Repeat post-prandial blood sugar & HbA1c test report.',
          created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
          status: 'completed' as const,
        },
        {
          id: 'demo-followup-3',
          visit_number: 'V-DEMO-3',
          patient_id: p2.id,
          patientName: p2.name,
          patientUhid: p2.uhid,
          patientPhone: p2.phone,
          patientAge: p2.age,
          bloodGroup: p2.blood_group,
          hasBP: p2.has_bp,
          hasSugar: p2.has_sugar,
          doctorId: d0.id,
          doctorName: d0.full_name || 'Dr. Priya Sharma',
          doctorSpec: d0.specialization || 'General Physician',
          doctorRoom: d0.consultation_room || 'Cabin 1',
          followUpDate: in3DaysStr,
          daysDifference: 3,
          category: 'upcoming' as const,
          instructions: 'Evaluate knee pain response to physiotherapy and painkillers.',
          created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
          status: 'completed' as const,
        },
      ];
    }

    return list;
  }, [visits, patients, doctors]);

  // Category counts
  const dueTomorrowCount = useMemo(() => allFollowUps.filter((f) => f.category === 'tomorrow').length, [allFollowUps]);
  const dueTodayCount = useMemo(() => allFollowUps.filter((f) => f.category === 'today').length, [allFollowUps]);
  const upcomingCount = useMemo(() => allFollowUps.filter((f) => f.category === 'upcoming').length, [allFollowUps]);
  const overdueCount = useMemo(() => allFollowUps.filter((f) => f.category === 'overdue').length, [allFollowUps]);
  const pendingTomorrowCount = useMemo(() => {
    return allFollowUps.filter(
      (f) => f.category === 'tomorrow' && (reminderStatuses[f.id]?.status || 'pending') === 'pending'
    ).length;
  }, [allFollowUps, reminderStatuses]);

  // Filtered follow-up list
  const filteredFollowUps = useMemo(() => {
    return allFollowUps
      .filter((f) => {
        // 1. Timeframe Filter
        if (timeframeFilter === 'tomorrow' && f.category !== 'tomorrow') return false;
        if (timeframeFilter === 'today' && f.category !== 'today') return false;
        if (timeframeFilter === 'upcoming' && f.category !== 'upcoming') return false;
        if (timeframeFilter === 'overdue' && f.category !== 'overdue') return false;

        // 2. Reminder Status Filter
        const remStatus = reminderStatuses[f.id]?.status || 'pending';
        if (reminderFilter === 'pending' && remStatus !== 'pending') return false;
        if (reminderFilter === 'sent' && remStatus !== 'sent') return false;
        if (reminderFilter === 'confirmed' && remStatus !== 'confirmed') return false;

        // 3. Doctor Filter
        if (followUpDoctorFilter !== 'all' && f.doctorId !== followUpDoctorFilter) return false;

        // 4. Search Filter
        const q = followUpSearch.trim().toLowerCase();
        if (q) {
          const match =
            f.patientName.toLowerCase().includes(q) ||
            f.patientPhone.toLowerCase().includes(q) ||
            f.patientUhid.toLowerCase().includes(q) ||
            (f.doctorName || '').toLowerCase().includes(q) ||
            (f.instructions || '').toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => a.daysDifference - b.daysDifference);
  }, [allFollowUps, timeframeFilter, reminderFilter, followUpDoctorFilter, followUpSearch, reminderStatuses]);

  // -------------------------------------------------------------
  // Modals State: Customize WhatsApp, Reschedule, New Schedule
  // -------------------------------------------------------------
  const [previewTarget, setPreviewTarget] = useState<(typeof allFollowUps)[0] | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState<(typeof allFollowUps)[0] | null>(null);
  const [newFollowUpDate, setNewFollowUpDate] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [newSchedulePatientId, setNewSchedulePatientId] = useState('');
  const [newScheduleDoctorId, setNewScheduleDoctorId] = useState('');
  const [newScheduleDate, setNewScheduleDate] = useState('');
  const [newScheduleInstructions, setNewScheduleInstructions] = useState('');
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);

  // -------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------
  function handleSendWhatsApp(item: (typeof allFollowUps)[0], customText?: string) {
    const rawPhone = item.patientPhone;
    const cleaned = cleanIndianPhone(rawPhone);
    if (!cleaned) {
      triggerToast(`Cannot send WhatsApp: Patient ${item.patientName} does not have a valid mobile number.`);
      return;
    }

    const message =
      customText ||
      buildFollowUpWhatsAppMessage({
        patientName: item.patientName,
        patientPhone: cleaned,
        uhid: item.patientUhid,
        doctorName: item.doctorName || 'Dr. Assigned',
        doctorSpec: item.doctorSpec,
        doctorRoom: item.doctorRoom,
        followUpDate: item.followUpDate,
        hospitalName: hospitalSettings?.hospital_name || 'RADHA KRISHNA HOSPITAL',
        hospitalPhone: hospitalSettings?.phone || '+91 80 2345 6789',
        instructions: item.instructions,
      });

    const url = generateWhatsAppUrl(cleaned, message);
    window.open(url, '_blank');

    const sentAt = new Date().toISOString();
    saveReminderStatus(item.id, 'sent', { sentAt });

    recordAuditLog({
      action: 'UPDATE',
      entity_type: 'follow_up_reminder',
      record_id: item.id,
      user_name: user?.fullName || 'Receptionist',
      user_role: user?.role || 'receptionist',
      details: `Sent WhatsApp follow-up reminder to ${item.patientName} (${cleaned}) for appointment on ${item.followUpDate}`,
      new_data: {
        patientName: item.patientName,
        patientPhone: cleaned,
        followUpDate: item.followUpDate,
        doctorName: item.doctorName,
        status: 'sent',
        sentAt,
      },
    });

    triggerToast(`WhatsApp reminder opened for ${item.patientName} (Follow-up due ${formatFollowUpDisplay(item.followUpDate)}).`);
  }

  function openCustomizeModal(item: (typeof allFollowUps)[0]) {
    const defaultMsg = buildFollowUpWhatsAppMessage({
      patientName: item.patientName,
      patientPhone: item.patientPhone,
      uhid: item.patientUhid,
      doctorName: item.doctorName || 'Dr. Assigned',
      doctorSpec: item.doctorSpec,
      doctorRoom: item.doctorRoom,
      followUpDate: item.followUpDate,
      hospitalName: hospitalSettings?.hospital_name || 'RADHA KRISHNA HOSPITAL',
      hospitalPhone: hospitalSettings?.phone || '+91 80 2345 6789',
      instructions: item.instructions,
    });
    setPreviewTarget(item);
    setCustomMessage(defaultMsg);
    setCopiedMessage(false);
  }

  function handleSendNextPendingTomorrow() {
    const pendingTomorrow = allFollowUps.filter(
      (f) => f.category === 'tomorrow' && (reminderStatuses[f.id]?.status || 'pending') === 'pending'
    );
    if (pendingTomorrow.length === 0) {
      triggerToast('All reminders for tomorrow have already been sent!');
      return;
    }
    const nextItem = pendingTomorrow[0];
    handleSendWhatsApp(nextItem);
  }

  async function handleConfirmReschedule() {
    if (!rescheduleTarget || !newFollowUpDate || isRescheduling) return;
    setIsRescheduling(true);

    const visitId = rescheduleTarget.id;
    const oldDate = rescheduleTarget.followUpDate;

    // 1. Optimistic Query Cache Update
    queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
      old
        ? old.map((v) =>
            v.id === visitId
              ? { ...v, follow_up_date: newFollowUpDate, updated_at: new Date().toISOString() }
              : v
          )
        : []
    );

    // 2. Broadcast change
    broadcastChange('visit_updated', {
      visit: { id: visitId, follow_up_date: newFollowUpDate },
    });

    // 3. Update reminder status
    saveReminderStatus(visitId, 'rescheduled', { notes: `Rescheduled from ${oldDate} to ${newFollowUpDate}` });

    // 4. Audit Log
    recordAuditLog({
      action: 'UPDATE',
      entity_type: 'follow_up_reschedule',
      record_id: visitId,
      user_name: user?.fullName || 'Receptionist',
      user_role: user?.role || 'receptionist',
      details: `Rescheduled follow-up appointment for ${rescheduleTarget.patientName} from ${oldDate} to ${newFollowUpDate}`,
      old_data: { followUpDate: oldDate },
      new_data: { followUpDate: newFollowUpDate },
    });

    triggerToast(`Follow-up appointment for ${rescheduleTarget.patientName} rescheduled to ${formatFollowUpDisplay(newFollowUpDate)}.`);

    // 5. Supabase sync in background
    try {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitId)) {
        const supabase = createClient();
        await supabase
          .from('visits')
          .update({ follow_up_date: newFollowUpDate, updated_at: new Date().toISOString() })
          .eq('id', visitId);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('Failed to update follow_up_date in Supabase:', err);
    } finally {
      setIsRescheduling(false);
      setRescheduleTarget(null);
    }
  }

  async function handleCreateNewSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newSchedulePatientId || !newScheduleDoctorId || !newScheduleDate || isCreatingSchedule) return;
    setIsCreatingSchedule(true);

    const pat = patients.find((p) => p.id === newSchedulePatientId);
    const doc = doctors.find((d) => d.id === newScheduleDoctorId);

    const newVisitId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fu-${Date.now()}`;
    const newVisit: Visit = {
      id: newVisitId,
      visit_number: `FU-${Date.now().toString().slice(-4)}`,
      patient_id: newSchedulePatientId,
      doctor_id: newScheduleDoctorId,
      token_number: 99,
      status: 'completed',
      follow_up_date: newScheduleDate,
      instructions: newScheduleInstructions || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic cache update
    queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
      old ? [newVisit, ...old] : [newVisit]
    );

    // Peer broadcast
    broadcastChange('visit_updated', { visit: newVisit });

    // Audit log
    recordAuditLog({
      action: 'CREATE',
      entity_type: 'follow_up_appointment',
      record_id: newVisitId,
      user_name: user?.fullName || 'Receptionist',
      user_role: user?.role || 'receptionist',
      details: `Booked follow-up appointment for ${pat?.name || 'Patient'} with ${doc?.full_name || 'Doctor'} on ${newScheduleDate}`,
      new_data: {
        patientName: pat?.name || 'Patient',
        doctorName: doc?.full_name || 'Doctor',
        followUpDate: newScheduleDate,
        instructions: newScheduleInstructions,
      },
    });

    triggerToast(`Follow-up appointment booked for ${pat?.name || 'Patient'} on ${formatFollowUpDisplay(newScheduleDate)}.`);

    // Supabase sync
    try {
      const supabase = createClient();
      await supabase.from('visits').insert({
        id: newVisitId,
        visit_number: newVisit.visit_number,
        patient_id: newVisit.patient_id,
        doctor_id: newVisit.doctor_id,
        token_number: newVisit.token_number,
        status: newVisit.status,
        follow_up_date: newVisit.follow_up_date,
        instructions: newVisit.instructions,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('Failed to insert new follow-up visit into Supabase:', err);
    } finally {
      setIsCreatingSchedule(false);
      setIsScheduleModalOpen(false);
      setNewSchedulePatientId('');
      setNewScheduleDoctorId('');
      setNewScheduleDate('');
      setNewScheduleInstructions('');
    }
  }

  // OPD Queue Row Handlers
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

    // 1. Optimistic Query Cache Update
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.filter((v) => !idsToDelete.includes(v.id)) : []
    );

    // 2. Remove deleted IDs from current selection
    setSelectedVisitIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));

    // 3. Instant Peer Broadcast
    broadcastChange('visits_deleted', { visitIds: idsToDelete });

    // 4. UI Toast
    triggerToast(
      count === 1
        ? 'Patient visit removed from the queue.'
        : `${count} patient visits removed from the queue.`
    );

    // 5. Supabase deletion
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

  async function handleMoveToCabin(visitId: string, token: number) {
    if (updatingVisitId === visitId) return;
    setUpdatingVisitId(visitId);
    const supabase = createClient();
    const updated_at = new Date().toISOString();
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.map((v) => (v.id === visitId ? { ...v, status: 'in_consultation', updated_at } : v)) : []
    );
    broadcastChange('visit_updated', { visit: { id: visitId, status: 'in_consultation' } });
    triggerToast(`Token #${String(token).padStart(2, '0')} called into Doctor Consultation Cabin.`);
    setUpdatingVisitId(null);

    try {
      const { error } = await supabase.from('visits').update({ status: 'in_consultation', updated_at }).eq('id', visitId);
      if (error) console.warn('Supabase update error:', error.message);
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('handleMoveToCabin error:', err);
    }
  }

  async function handleCompleteConsultation(visitId: string, token: number) {
    if (updatingVisitId === visitId) return;
    setUpdatingVisitId(visitId);
    const supabase = createClient();
    const updated_at = new Date().toISOString();
    queryClient.setQueriesData<Visit[]>({ queryKey: ['visits'] }, (old) =>
      old ? old.map((v) => (v.id === visitId ? { ...v, status: 'completed', updated_at } : v)) : []
    );
    broadcastChange('visit_updated', { visit: { id: visitId, status: 'completed' } });
    triggerToast(`Token #${String(token).padStart(2, '0')} consultation completed.`);
    setUpdatingVisitId(null);

    try {
      const { error } = await supabase.from('visits').update({ status: 'completed', updated_at }).eq('id', visitId);
      if (error) console.warn('Supabase update error:', error.message);
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    } catch (err) {
      console.warn('handleCompleteConsultation error:', err);
    }
  }

  return (
    <>
      <PageHeader
        title={activeTab === 'queue' ? 'OPD Reception Desk' : 'Follow-up Consultation Desk'}
        subtitle={
          activeTab === 'queue'
            ? `Welcome, ${user?.fullName || 'Receptionist'} · Seamless Reception → Doctor Consultation Flow`
            : `Follow-up appointments set by doctors · 1-click personalized WhatsApp reminders sent day before appointment`
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'follow_ups' ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CalendarClock size={14} />}
                  onClick={() => setIsScheduleModalOpen(true)}
                >
                  Schedule Follow-up
                </Button>
                <Link href="/reception/register">
                  <Button size="sm" icon={<Plus size={14} />}>Register Patient</Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/ip">
                  <Button variant="secondary" size="sm" icon={<BedDouble size={14} />}>
                    IP Admissions
                  </Button>
                </Link>
                <Link href="/reception/register">
                  <Button size="sm" icon={<Plus size={14} />}>Register New Patient</Button>
                </Link>
              </>
            )}
          </div>
        }
      />

      {/* Primary Section Switcher Tabs: OPD Queue vs Follow-up Reminders */}
      <div className="flex items-center gap-2 mb-5 p-1 bg-white rounded-xl border border-[var(--line-soft)] shadow-2xs w-full max-w-xl">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer',
            activeTab === 'queue'
              ? 'bg-[var(--green-900)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-canvas)]'
          )}
        >
          <Clock size={15} />
          <span>OPD Live Queue</span>
          <span
            className={clsx(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums',
              activeTab === 'queue' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
            )}
          >
            {todayVisits.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('follow_ups')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer relative',
            activeTab === 'follow_ups'
              ? 'bg-[var(--green-900)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-canvas)]'
          )}
        >
          <MessageSquare size={15} />
          <span>Follow-up Reminders</span>
          {dueTomorrowCount > 0 ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs animate-pulse">
              {dueTomorrowCount} Due Tomorrow
            </span>
          ) : (
            <span
              className={clsx(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums',
                activeTab === 'follow_ups' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
              )}
            >
              {allFollowUps.length}
            </span>
          )}
        </button>
      </div>

      {/* Live Toast Notification Banner */}
      {toastMessage && (
        <div className="mb-5 bg-[var(--green-900)] text-white text-xs font-medium px-4 py-2.5 rounded-[var(--r-tile)] flex items-center justify-between shadow-[var(--shadow-float)] animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle size={15} className="text-[var(--sage-200)] shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: OPD LIVE QUEUE & JOURNEY */}
      {/* ========================================================================= */}
      {activeTab === 'queue' && (
        <>
          {/* Proactive Follow-up Alert Banner if patients are due tomorrow */}
          {dueTomorrowCount > 0 && (
            <div className="mb-5 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-[var(--r-tile)] p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2.5 text-xs text-amber-950">
                <span className="h-8 w-8 rounded-full bg-amber-200/70 text-amber-900 flex items-center justify-center shrink-0">
                  <MessageSquare size={16} />
                </span>
                <div>
                  <p className="font-bold text-sm leading-tight text-amber-950">
                    {dueTomorrowCount} patient follow-up{dueTomorrowCount > 1 ? 's are' : ' is'} due tomorrow!
                  </p>
                  <p className="text-[11px] text-amber-900/80 mt-0.5">
                    Send personalized WhatsApp reminders today so patients confirm and prepare for their visit.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('follow_ups');
                  setTimeframeFilter('tomorrow');
                }}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <span>Send WhatsApp Reminders</span>
                <ArrowRight size={13} />
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
                stage: 'waiting' as StageFilter,
                label: 'In Doctor Queue (Lobby)',
                value: waitingOnly,
                icon: <Clock size={18} />,
                color: 'text-amber-800',
                subtext: 'Waiting for consultation',
              },
              {
                stage: 'in_consultation' as StageFilter,
                label: 'In Doctor Cabin',
                value: consultingOnly,
                icon: <Stethoscope size={18} />,
                color: 'text-blue-800',
                subtext: 'Currently consulting doctor',
              },
              {
                stage: 'completed' as StageFilter,
                label: 'Completed Consultations',
                value: completedOnly,
                icon: <CheckCircle size={18} />,
                color: 'text-[var(--green-800)]',
                subtext: 'Doctor consultation finished',
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
                    (v) => v.doctor_id === doc.id && (v.status === 'completed' || (v.status as any) === 'prescribed' || (v.status as any) === 'dispensed')
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
                        { id: 'waiting' as StageFilter, label: 'Waiting' },
                        { id: 'in_consultation' as StageFilter, label: 'In Cabin' },
                        { id: 'completed' as StageFilter, label: 'Completed' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setStageFilter(s.id)}
                          className={clsx(
                            'px-2.5 py-1.5 sm:py-1 rounded-[var(--r-pill)] font-medium transition-all shrink-0 min-h-[36px] sm:min-h-0 snap-start cursor-pointer',
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
                        {/* 2-Step Journey Pipeline Stepper */}
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
                          {item.status === 'completed' && (
                            <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold shrink-0">
                              <CheckCircle size={12} /> Consulted
                            </span>
                          )}

                          <span className="text-[var(--text-faint)] shrink-0">→</span>

                          {/* Step 3: Done */}
                          {item.status === 'completed' ? (
                            <span className="flex items-center gap-1 text-[var(--green-700)] font-semibold shrink-0">
                              <CheckCircle size={12} /> Completed
                            </span>
                          ) : (
                            <span className="text-[var(--text-faint)] shrink-0">Completed</span>
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
                                onClick={() => handleCompleteConsultation(item.id, item.token_number)}
                                className="text-xs font-semibold px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] bg-[var(--green-900)] text-white hover:bg-[var(--green-800)] rounded-[var(--r-control)] shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
                                title="Mark consultation as completed"
                              >
                                <Check size={14} />
                                Mark Done
                              </button>
                              <Link
                                href={`/doctor/prescribe?visitId=${item.id}&patientId=${item.patient_id}&token=${item.token_number}&name=${encodeURIComponent(
                                  item.patientName
                                )}`}
                                className="w-full sm:w-auto"
                              >
                                <Button size="sm" variant="secondary" className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]" icon={<ChevronRight size={14} />} iconPosition="right">
                                  Write Rx
                                </Button>
                              </Link>
                            </>
                          )}

                          {item.status === 'completed' && (
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
        </>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: FOLLOW-UP REMINDERS & WHATSAPP MANAGEMENT SYSTEM */}
      {/* ========================================================================= */}
      {activeTab === 'follow_ups' && (
        <div className="space-y-6">
          {/* Follow-up Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {[
              {
                id: 'tomorrow' as FollowUpTimeframe,
                label: 'Due Tomorrow',
                count: dueTomorrowCount,
                highlight: true,
                badgeText: 'Send Reminders Today',
                icon: <MessageSquare size={16} />,
                sub: `${pendingTomorrowCount} pending dispatch`,
                borderClass: 'border-amber-300 bg-amber-50/40 text-amber-950',
                activeClass: 'ring-2 ring-amber-500 bg-white border-amber-500 shadow-md',
              },
              {
                id: 'today' as FollowUpTimeframe,
                label: 'Due Today',
                count: dueTodayCount,
                highlight: false,
                badgeText: 'Expected Today',
                icon: <Clock size={16} />,
                sub: 'Attending OPD today',
                borderClass: 'border-blue-200 bg-blue-50/30 text-blue-950',
                activeClass: 'ring-2 ring-blue-500 bg-white border-blue-500 shadow-md',
              },
              {
                id: 'upcoming' as FollowUpTimeframe,
                label: 'Next 7 Days',
                count: upcomingCount,
                highlight: false,
                badgeText: 'This Week',
                icon: <CalendarCheck size={16} />,
                sub: 'Scheduled 2-7 days ahead',
                borderClass: 'border-emerald-200 bg-emerald-50/30 text-emerald-950',
                activeClass: 'ring-2 ring-[var(--green-700)] bg-white border-[var(--green-700)] shadow-md',
              },
              {
                id: 'overdue' as FollowUpTimeframe,
                label: 'Overdue / Missed',
                count: overdueCount,
                highlight: false,
                badgeText: 'Date Passed',
                icon: <AlertTriangle size={16} />,
                sub: 'Needs follow-up call',
                borderClass: 'border-rose-200 bg-rose-50/30 text-rose-950',
                activeClass: 'ring-2 ring-rose-500 bg-white border-rose-500 shadow-md',
              },
              {
                id: 'all' as FollowUpTimeframe,
                label: 'All Follow-ups',
                count: allFollowUps.length,
                highlight: false,
                badgeText: 'Hospital Roster',
                icon: <Calendar size={16} />,
                sub: 'Total scheduled database',
                borderClass: 'border-[var(--line-soft)] bg-white text-[var(--text-strong)]',
                activeClass: 'ring-2 ring-[var(--green-900)] bg-white border-[var(--green-900)] shadow-md',
              },
            ].map((t) => {
              const isSelected = timeframeFilter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeframeFilter(t.id)}
                  className={clsx(
                    'rounded-[var(--r-tile)] p-3 text-left transition-all border flex flex-col justify-between cursor-pointer min-h-[96px]',
                    isSelected ? t.activeClass : t.borderClass,
                    'hover:shadow-xs hover:bg-white'
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="p-1.5 rounded-lg bg-white/80 border border-black/5 text-[var(--text-strong)] shadow-2xs">
                      {t.icon}
                    </span>
                    <span className="text-2xl font-black tabular-nums tracking-tight">
                      {t.count}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight">{t.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{t.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Follow-up Main Workspace Card */}
          <Card>
            <CardHeader
              title="Follow-up Patient Consultations & WhatsApp Manager"
              count={filteredFollowUps.length}
              action={
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  {/* Doctor filter dropdown */}
                  <select
                    value={followUpDoctorFilter}
                    onChange={(e) => setFollowUpDoctorFilter(e.target.value)}
                    className="h-10 sm:h-9 rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] px-3 text-base sm:text-xs text-[var(--text-body)] focus:outline-none focus:border-[var(--green-600)] shrink-0 min-h-[40px] sm:min-h-0"
                  >
                    <option value="all">All Doctors</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} ({d.specialization})
                      </option>
                    ))}
                  </select>

                  {/* Reminder status filter */}
                  <select
                    value={reminderFilter}
                    onChange={(e) => setReminderFilter(e.target.value as ReminderStatusFilter)}
                    className="h-10 sm:h-9 rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] px-3 text-base sm:text-xs text-[var(--text-body)] focus:outline-none focus:border-[var(--green-600)] shrink-0 min-h-[40px] sm:min-h-0"
                  >
                    <option value="all">All Reminders</option>
                    <option value="pending">Pending Reminder</option>
                    <option value="sent">Reminder Sent</option>
                    <option value="confirmed">Confirmed by Patient</option>
                  </select>

                  <SearchInput
                    value={followUpSearch}
                    onChange={setFollowUpSearch}
                    placeholder="Search patient, phone, UHID, doctor..."
                    className="w-full sm:w-56"
                  />
                </div>
              }
            />

            {/* Sub-Filter Tabs Bar & Quick Dispatch Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-2.5 mb-3 bg-[var(--bg-canvas)] rounded-[var(--r-control)] border border-[var(--line-soft)]">
              {/* Timeframe pill tabs */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                {[
                  { id: 'tomorrow' as FollowUpTimeframe, label: 'Due Tomorrow', count: dueTomorrowCount },
                  { id: 'today' as FollowUpTimeframe, label: 'Due Today', count: dueTodayCount },
                  { id: 'upcoming' as FollowUpTimeframe, label: 'Next 7 Days', count: upcomingCount },
                  { id: 'overdue' as FollowUpTimeframe, label: 'Overdue', count: overdueCount },
                  { id: 'all' as FollowUpTimeframe, label: 'All', count: allFollowUps.length },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setTimeframeFilter(s.id)}
                    className={clsx(
                      'px-3 py-1.5 rounded-[var(--r-pill)] text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer',
                      timeframeFilter === s.id
                        ? 'bg-[var(--green-900)] text-white shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-white'
                    )}
                  >
                    <span>{s.label}</span>
                    <span
                      className={clsx(
                        'text-[10px] px-1.5 py-0.2 rounded-full tabular-nums',
                        timeframeFilter === s.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-800'
                      )}
                    >
                      {s.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Quick Actions: Fast Send for Tomorrow or Book New Follow-up */}
              <div className="flex items-center gap-2 flex-wrap">
                {timeframeFilter === 'tomorrow' && pendingTomorrowCount > 0 && (
                  <button
                    type="button"
                    onClick={handleSendNextPendingTomorrow}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white shadow-xs transition-colors cursor-pointer"
                    title="Send pre-filled WhatsApp reminder to next pending patient"
                  >
                    <Send size={13} />
                    <span>Send Next Due Tomorrow ({pendingTomorrowCount} pending)</span>
                  </button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CalendarClock size={13} />}
                  onClick={() => setIsScheduleModalOpen(true)}
                >
                  + New Schedule
                </Button>
              </div>
            </div>

            {/* List of Follow-up Appointments */}
            {filteredFollowUps.length === 0 ? (
              <EmptyState
                icon={<CalendarClock size={22} />}
                title="No follow-up appointments found"
                description={
                  timeframeFilter === 'tomorrow'
                    ? 'No patient follow-ups scheduled for tomorrow. Check "All" or "+ New Schedule" to book a patient.'
                    : 'Try changing the filters or schedule a follow-up consultation.'
                }
                action={
                  <div className="flex items-center gap-2">
                    {timeframeFilter !== 'all' && (
                      <Button size="sm" variant="secondary" onClick={() => setTimeframeFilter('all')}>
                        Show All Follow-ups
                      </Button>
                    )}
                    <Button size="sm" icon={<CalendarClock size={14} />} onClick={() => setIsScheduleModalOpen(true)}>
                      + Schedule Follow-up
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {filteredFollowUps.map((item) => {
                  const rem = reminderStatuses[item.id] || { status: 'pending' as const };
                  const isSent = rem.status === 'sent';
                  const isConfirmed = rem.status === 'confirmed';
                  const formattedPhone = formatPhoneDisplay(item.patientPhone);
                  const displayTiming = formatFollowUpDisplay(item.followUpDate);

                  return (
                    <div
                      key={item.id}
                      className={clsx(
                        'flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 rounded-[var(--r-tile)] p-4 border transition-all duration-150',
                        item.category === 'tomorrow' && !isSent
                          ? 'bg-amber-50/30 border-amber-300/80 shadow-xs ring-1 ring-amber-400/20'
                          : 'bg-white border-[var(--line-soft)] hover:border-[var(--green-600)]/40 hover:shadow-subtle'
                      )}
                    >
                      {/* Left Block: Patient & Doctor Details */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Avatar name={item.patientName} size="md" className="shrink-0 mt-0.5 hidden xs:flex" />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-[var(--text-strong)] leading-tight">
                              {item.patientName}
                            </span>
                            <span className="text-xs text-[var(--text-muted)] tabular-nums">
                              {item.patientAge} yrs {item.bloodGroup ? `· ${item.bloodGroup}` : ''}
                            </span>
                            {item.hasBP && <StatusPill variant="warning" label="BP" />}
                            {item.hasSugar && <StatusPill variant="info" label="Sugar" />}
                          </div>

                          <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                            <span className="font-mono font-semibold text-[var(--text-strong)]">{item.patientUhid}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-mono text-[var(--text-strong)]">
                              <Phone size={11} className="text-gray-400" />
                              {formattedPhone}
                            </span>
                            <span>·</span>
                            <span className="font-medium text-[var(--green-800)]">
                              {item.doctorName} ({item.doctorRoom})
                            </span>
                            <span>·</span>
                            <span className="text-[11px] text-[var(--text-muted)]">
                              Consulted: {new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>

                          {/* Doctor Clinical Advice / Instructions */}
                          {item.instructions && (
                            <div className="mt-2 text-xs bg-amber-50/70 border border-amber-200/60 rounded-md px-2.5 py-1.5 text-amber-950 flex items-start gap-1.5">
                              <Stethoscope size={13} className="text-amber-800 shrink-0 mt-0.5" />
                              <span className="leading-snug">
                                <strong className="font-semibold text-amber-900">Doctor Advice: </strong>
                                “{item.instructions}”
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Center Block: Scheduled Date Badge & Reminder Status */}
                      <div className="flex flex-row xl:flex-col items-center xl:items-start justify-between xl:justify-center gap-2 py-2 xl:py-0 border-y xl:border-y-0 border-[var(--line-soft)]/50 shrink-0">
                        {/* Due Date Indicator */}
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-[var(--green-700)] shrink-0" />
                          <span
                            className={clsx(
                              'text-xs font-bold px-2 py-0.5 rounded-full border',
                              item.category === 'tomorrow'
                                ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                : item.category === 'today'
                                ? 'bg-blue-100 text-blue-900 border-blue-200'
                                : item.category === 'overdue'
                                ? 'bg-rose-100 text-rose-900 border-rose-200'
                                : 'bg-gray-100 text-gray-800 border-gray-200'
                            )}
                          >
                            {displayTiming}
                          </span>
                        </div>

                        {/* Reminder Status Pill */}
                        <div>
                          {isConfirmed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                              <UserCheck size={12} /> Confirmed by Patient
                            </span>
                          ) : isSent ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle size={12} /> Reminder Sent
                              {rem.sentAt && (
                                <span className="text-[10px] text-emerald-700/80 font-normal">
                                  ({new Date(rem.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                              <Clock size={12} /> Pending Reminder
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Block: 1-Click Interactive Actions */}
                      <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap justify-end shrink-0">
                        {/* Primary WhatsApp Action Button */}
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(item)}
                          className={clsx(
                            'text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer touch-manipulation',
                            isSent
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-[#25D366] hover:bg-[#20ba59] text-white'
                          )}
                          title="Open WhatsApp with personalized pre-typed reminder"
                        >
                          <Send size={13} />
                          <span>{isSent ? 'Resend WhatsApp' : 'Send WhatsApp'}</span>
                        </button>

                        {/* Customize / Preview Message Button */}
                        <button
                          type="button"
                          onClick={() => openCustomizeModal(item)}
                          className="text-xs font-semibold px-2.5 py-2 bg-white hover:bg-[var(--bg-canvas)] text-[var(--text-strong)] border border-[var(--line-soft)] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="Preview and edit personalized message before sending"
                        >
                          <FileText size={13} />
                          <span>Preview</span>
                        </button>

                        {/* Direct Native Call Button */}
                        <a
                          href={`tel:${cleanIndianPhone(item.patientPhone)}`}
                          className="h-8 w-8 rounded-lg border border-[var(--line-soft)] bg-white hover:bg-emerald-50 text-gray-600 hover:text-[var(--green-800)] flex items-center justify-center transition-colors"
                          title={`Call patient at ${item.patientPhone}`}
                        >
                          <Phone size={13} />
                        </a>

                        {/* Reschedule Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(item);
                            setNewFollowUpDate(item.followUpDate);
                          }}
                          className="h-8 px-2.5 rounded-lg border border-[var(--line-soft)] bg-white hover:bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors flex items-center gap-1 cursor-pointer"
                          title="Change follow-up appointment date"
                        >
                          <CalendarClock size={13} />
                          <span>Reschedule</span>
                        </button>

                        {/* Attendance Confirmation Toggle */}
                        {!isConfirmed ? (
                          <button
                            type="button"
                            onClick={() => {
                              saveReminderStatus(item.id, 'confirmed');
                              triggerToast(`${item.patientName} confirmed attendance for ${displayTiming}.`);
                            }}
                            className="h-8 px-2 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Mark patient confirmed"
                          >
                            <Check size={13} />
                            <span>Confirm</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              saveReminderStatus(item.id, 'sent');
                              triggerToast(`Reset confirmation status for ${item.patientName}.`);
                            }}
                            className="h-8 px-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors cursor-pointer"
                            title="Reset confirmation"
                          >
                            <span>Undo</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: PREVIEW & CUSTOMIZE WHATSAPP REMINDER */}
      {/* ========================================================================= */}
      {previewTarget && (
        <div
          onClick={() => setPreviewTarget(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-[var(--line-soft)] shadow-2xl max-w-lg w-full p-5 space-y-4 animate-scaleUp"
          >
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] pb-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-[#25D366]/20 text-[#128C7E] flex items-center justify-center font-bold">
                  <Send size={15} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-strong)] leading-tight">
                    Personalized WhatsApp Reminder Preview
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Review and customize clinical notes before opening WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTarget(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target Patient Badge */}
            <div className="bg-[var(--bg-canvas)] p-2.5 rounded-xl border border-[var(--line-soft)] flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-[var(--text-strong)]">{previewTarget.patientName}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  UHID: {previewTarget.patientUhid} · Phone: {previewTarget.patientPhone}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[var(--green-800)]">{previewTarget.doctorName}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{formatFollowUpDisplay(previewTarget.followUpDate)}</p>
              </div>
            </div>

            {/* Quick Note Helper Chips */}
            <div>
              <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">Quick Clinical Presets to Insert:</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setCustomMessage((prev) =>
                      prev.replace(
                        `🩺 *Patient Guidelines:*`,
                        `🩺 *Patient Guidelines:*\n• Fasting for 10-12 hours required for fasting blood sugar & lipid tests.`
                      )
                    );
                  }}
                  className="text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-md hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  + Fasting Lab Note
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomMessage((prev) =>
                      prev.replace(
                        `🩺 *Patient Guidelines:*`,
                        `🩺 *Patient Guidelines:*\n• Please bring all previous MRI, X-Ray, and discharge summaries.`
                      )
                    );
                  }}
                  className="text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-md hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  + Bring Previous Scans
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomMessage((prev) =>
                      prev.replace(
                        `Wishing you good health!`,
                        `• Please take your morning BP medication with a sip of water as scheduled.\n\nWishing you good health!`
                      )
                    );
                  }}
                  className="text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200 px-2 py-1 rounded-md hover:bg-purple-100 transition-colors cursor-pointer"
                >
                  + Morning BP Medicine Note
                </button>
              </div>
            </div>

            {/* Editable Message Textarea */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                WhatsApp Message Body (Personalized & Ready to Send):
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={11}
                className="w-full text-xs font-mono p-3 rounded-xl border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)] leading-relaxed resize-y bg-slate-50/50"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Supports WhatsApp formatting: <code className="text-gray-800">*bold*</code>, <code className="text-gray-800">_italic_</code>.
              </p>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--line-soft)]">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(customMessage);
                  setCopiedMessage(true);
                  setTimeout(() => setCopiedMessage(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-black py-2 px-3 rounded-lg border border-[var(--line-soft)] hover:bg-[var(--bg-canvas)] transition-colors cursor-pointer"
              >
                {copiedMessage ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedMessage ? 'Copied to Clipboard!' : 'Copy Message'}</span>
              </button>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPreviewTarget(null)}>
                  Cancel
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    handleSendWhatsApp(previewTarget, customMessage);
                    setPreviewTarget(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white shadow-xs transition-colors cursor-pointer"
                >
                  <Send size={14} />
                  <span>Send via WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RESCHEDULE FOLLOW-UP DATE */}
      {/* ========================================================================= */}
      {rescheduleTarget && (
        <div
          onClick={() => {
            if (!isRescheduling) setRescheduleTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-[var(--line-soft)] shadow-2xl max-w-md w-full p-5 space-y-4 animate-scaleUp"
          >
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] pb-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <CalendarClock size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-strong)] leading-tight">
                    Reschedule Follow-up Appointment
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Update scheduled consultation date for {rescheduleTarget.patientName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                disabled={isRescheduling}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-[var(--bg-canvas)] p-3 rounded-xl border border-[var(--line-soft)] text-xs space-y-1">
              <p>
                <strong className="text-[var(--text-strong)]">Patient: </strong>
                {rescheduleTarget.patientName} (UHID: {rescheduleTarget.patientUhid})
              </p>
              <p>
                <strong className="text-[var(--text-strong)]">Doctor: </strong>
                {rescheduleTarget.doctorName} ({rescheduleTarget.doctorRoom})
              </p>
              <p>
                <strong className="text-[var(--text-strong)]">Current Date: </strong>
                <span className="text-amber-800 font-semibold">{formatFollowUpDisplay(rescheduleTarget.followUpDate)}</span>
              </p>
            </div>

            {/* Quick Date Shift Presets */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1.5">
                Quick Date Selection:
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: 'Tomorrow', days: 1 },
                  { label: '+3 Days', days: 3 },
                  { label: '+7 Days (1 Wk)', days: 7 },
                  { label: '+14 Days (2 Wks)', days: 14 },
                  { label: '+1 Month', days: 30 },
                ].map((preset) => {
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + preset.days);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        setNewFollowUpDate(`${y}-${m}-${day}`);
                      }}
                      className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 border border-gray-200 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calendar Date Picker Input */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                Select New Follow-up Date *
              </label>
              <input
                type="date"
                value={newFollowUpDate}
                onChange={(e) => setNewFollowUpDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
              />
              {newFollowUpDate && (
                <p className="text-[11px] text-[var(--green-800)] font-semibold mt-1">
                  New appointment scheduled for: {formatFollowUpDisplay(newFollowUpDate)}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line-soft)]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRescheduleTarget(null)}
                disabled={isRescheduling}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                disabled={!newFollowUpDate || isRescheduling}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-[var(--green-900)] hover:bg-[var(--green-800)] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isRescheduling ? 'Saving...' : 'Save Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SCHEDULE NEW FOLLOW-UP APPOINTMENT */}
      {/* ========================================================================= */}
      {isScheduleModalOpen && (
        <div
          onClick={() => {
            if (!isCreatingSchedule) setIsScheduleModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-[var(--line-soft)] shadow-2xl max-w-md w-full p-5 space-y-4 animate-scaleUp"
          >
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] pb-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-[var(--sage-100)] text-[var(--green-900)] flex items-center justify-center font-bold">
                  <CalendarClock size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-strong)] leading-tight">
                    Schedule Patient Follow-up
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Create a scheduled follow-up consultation in the hospital roster
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                disabled={isCreatingSchedule}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewSchedule} className="space-y-3.5">
              {/* Patient Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                  Select Patient *
                </label>
                <select
                  required
                  value={newSchedulePatientId}
                  onChange={(e) => setNewSchedulePatientId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)] bg-white"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.uhid}) · {p.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Doctor Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                  Select Consulting Doctor *
                </label>
                <select
                  required
                  value={newScheduleDoctorId}
                  onChange={(e) => setNewScheduleDoctorId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)] bg-white"
                >
                  <option value="">-- Choose Doctor --</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.specialization} · {d.consultation_room})
                    </option>
                  ))}
                </select>
              </div>

              {/* Follow-up Date */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                  Follow-up Date *
                </label>
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: '+3 Days', days: 3 },
                    { label: '+7 Days', days: 7 },
                    { label: '+14 Days', days: 14 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + p.days);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        setNewScheduleDate(`${y}-${m}-${day}`);
                      }}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 border border-gray-200 transition-colors cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  required
                  value={newScheduleDate}
                  onChange={(e) => setNewScheduleDate(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                />
              </div>

              {/* Doctor Clinical Advice / Instructions */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                  Doctor Advice / Clinical Guidelines (Optional)
                </label>
                <textarea
                  value={newScheduleInstructions}
                  onChange={(e) => setNewScheduleInstructions(e.target.value)}
                  placeholder="e.g. Review fasting blood sugar & repeat lipid profile report."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line-soft)]">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  disabled={isCreatingSchedule}
                >
                  Cancel
                </Button>
                <button
                  type="submit"
                  disabled={!newSchedulePatientId || !newScheduleDoctorId || !newScheduleDate || isCreatingSchedule}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-[var(--green-900)] hover:bg-[var(--green-800)] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isCreatingSchedule ? 'Saving...' : 'Book Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPD DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
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
                    This will remove the record from the OPD Reception Queue and Doctor Queue.
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
