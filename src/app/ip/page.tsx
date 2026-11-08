'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  BedDouble,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  UserCheck,
  FileText,
  Printer,
  X,
  Edit2,
  DollarSign,
  Calendar,
  ChevronDown,
  Check,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import {
  useAdmissions,
  useWards,
  useBeds,
  usePatients,
  useDoctors,
  useHospitalSettings,
} from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { generateUUID } from '@/lib/utils/quantity';
import { pushWardToSupabase, pushBedToSupabase, pushAdmissionToSupabase } from '@/lib/supabase/sync';
import type { Admission, Bed, Ward } from '@/lib/types/database';
import { clsx } from 'clsx';

export default function InPatientPage() {
  const queryClient = useQueryClient();
  const { data: admissions = [] } = useAdmissions();
  const { data: wards = [] } = useWards();
  const { data: beds = [] } = useBeds();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const { data: settings = { hospital_name: 'RADHAKRISHNA HOSPITAL', ip_hours_per_day: 18 } as any } = useHospitalSettings();

  const [activeTab, setActiveTab] = useState<'admissions' | 'beds'>('admissions');
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [dischargeTarget, setDischargeTarget] = useState<Admission | null>(null);

  // Ward & Bed Management Modals
  const [showAddWardModal, setShowAddWardModal] = useState(false);
  const [newWardName, setNewWardName] = useState('');
  const [isSavingWard, setIsSavingWard] = useState(false);

  const [showAddBedModal, setShowAddBedModal] = useState(false);
  const [newBedWardId, setNewBedWardId] = useState(wards[0]?.id || '');
  const [newBedNumber, setNewBedNumber] = useState('');
  const [newBedPrice, setNewBedPrice] = useState(1200);
  const [isSavingBed, setIsSavingBed] = useState(false);

  const [editingBed, setEditingBed] = useState<Bed | null>(null);
  const [editBedPrice, setEditBedPrice] = useState(1200);

  // New admission form
  const [admitPatientId, setAdmitPatientId] = useState(patients[0]?.id || '');
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientDropdownRef = useRef<HTMLDivElement>(null);

  const [admitBedId, setAdmitBedId] = useState('');
  const [admitDoctorId, setAdmitDoctorId] = useState(doctors[0]?.id || '');
  const [admitDiagnosis, setAdmitDiagnosis] = useState('');
  const [hasBP, setHasBP] = useState(false);
  const [hasSugar, setHasSugar] = useState(false);
  const [isAdmitting, setIsAdmitting] = useState(false);

  // Filtered patients for admission search & selection
  const filteredAdmissionPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.uhid.toLowerCase().includes(q) ||
        p.phone.includes(q)
    );
  }, [patients, patientSearch]);

  // Click outside to close patient dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(event.target as Node)) {
        setShowPatientDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Synchronize default selections when async TanStack query data resolves
  useEffect(() => {
    if (!newBedWardId && wards.length > 0) {
      setNewBedWardId(wards[0].id);
    }
  }, [wards, newBedWardId]);

  useEffect(() => {
    if (admitPatientId) {
      const p = patients.find((pat) => pat.id === admitPatientId);
      if (p && !patientSearch) {
        setPatientSearch(`${p.name} (${p.uhid})`);
      }
    } else if (patients.length > 0 && !admitPatientId) {
      setAdmitPatientId(patients[0].id);
      setPatientSearch(`${patients[0].name} (${patients[0].uhid})`);
    }
  }, [patients, admitPatientId, patientSearch]);

  useEffect(() => {
    if (!admitDoctorId && doctors.length > 0) {
      setAdmitDoctorId(doctors[0].id);
    }
  }, [doctors, admitDoctorId]);

  const availableBeds = beds.filter((b) => !b.is_occupied);

  useEffect(() => {
    if (!admitBedId && availableBeds.length > 0) {
      setAdmitBedId(availableBeds[0].id);
    }
  }, [availableBeds, admitBedId]);

  async function handleAdmit(e: React.FormEvent) {
    e.preventDefault();
    const matchedFromSearch = filteredAdmissionPatients.length > 0 ? filteredAdmissionPatients[0].id : '';
    const effectivePatientId = admitPatientId || matchedFromSearch || (patients.length > 0 ? patients[0].id : '');
    const effectiveDoctorId = admitDoctorId || (doctors.length > 0 ? doctors[0].id : '');
    const effectiveBedId = admitBedId || (availableBeds.length > 0 ? availableBeds[0].id : '');

    if (!effectivePatientId || !effectiveBedId || !effectiveDoctorId) {
      alert('Please select patient, available bed, and attending doctor.');
      return;
    }

    setIsAdmitting(true);
    try {
      const nextNum = admissions.length + 1;
      const uaid = `IP-${String(nextNum).padStart(4, '0')}`;
      const bed = beds.find((b) => b.id === effectiveBedId);

      const newAdmission: Admission = {
        id: generateUUID(),
        uaid,
        patient_id: effectivePatientId,
        bed_id: effectiveBedId,
        doctor_id: effectiveDoctorId,
        diagnosis: admitDiagnosis || 'In-patient clinical care',
        has_bp: hasBP,
        has_sugar: hasSugar,
        status: 'admitted',
        admitted_at: new Date().toISOString(),
        hours_per_day: settings.ip_hours_per_day || 18,
        total_bed_charges: bed?.price_per_day || 1200,
        total_pharmacy_charges: 0,
        total_lab_charges: 0,
      };

      // Optimistic updates so UI responds instantly
      queryClient.setQueriesData<Admission[]>({ queryKey: queryKeys.admissions.all }, (old) =>
        old ? [newAdmission, ...old] : [newAdmission]
      );
      queryClient.setQueriesData<Bed[]>({ queryKey: queryKeys.beds.all }, (old) =>
        old ? old.map((b) => (b.id === effectiveBedId ? { ...b, is_occupied: true } : b)) : []
      );

      const res = await pushAdmissionToSupabase(newAdmission);
      if (!res.success) {
        alert('Warning: Admission could not be saved to database: ' + (res.error?.message || 'Database error'));
        return;
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.admissions.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
      setShowAdmitModal(false);
      setAdmitDiagnosis('');
      setAdmitBedId('');
    } catch (err: any) {
      console.error('Failed to admit patient:', err);
      alert('Failed to admit patient: ' + (err?.message || 'Server error'));
    } finally {
      setIsAdmitting(false);
    }
  }

  async function handleConfirmDischarge() {
    if (!dischargeTarget) return;

    const stay = calculateStay(dischargeTarget.admitted_at);
    const bed = beds.find((b) => b.id === dischargeTarget.bed_id);
    const finalBedCharges = stay.billingDays * (bed?.price_per_day || 1200);

    const updated: Admission = {
      ...dischargeTarget,
      status: 'discharged',
      discharged_at: new Date().toISOString(),
      total_bed_charges: finalBedCharges,
    };

    await pushAdmissionToSupabase(updated);
    queryClient.invalidateQueries({ queryKey: queryKeys.admissions.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
    setDischargeTarget(null);
  }

  // Calculate live hours stayed based on PRD v1.1 Section 3.7 timer
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  function calculateStay(admittedAt: string) {
    const diffMs = now - new Date(admittedAt).getTime();
    const totalHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
    const billingDays = Math.ceil(totalHours / (settings.ip_hours_per_day || 18));
    return { totalHours, billingDays };
  }

  async function handleAddWard() {
    if (!newWardName.trim()) {
      alert('Please enter a ward name.');
      return;
    }
    setIsSavingWard(true);
    try {
      const newWard: Ward = {
        id: generateUUID(),
        name: newWardName.trim(),
        is_active: true,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueriesData<Ward[]>({ queryKey: queryKeys.wards.all }, (old) =>
        old ? [...old, newWard] : [newWard]
      );
      const res = await pushWardToSupabase(newWard);
      if (!res.success) {
        alert('Failed to save ward to database: ' + (res.error?.message || 'Database error'));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.wards.all });
      setNewBedWardId(newWard.id);
      setNewWardName('');
      setShowAddWardModal(false);
    } catch (err: any) {
      console.error('Failed to create ward:', err);
      alert('Failed to create ward: ' + (err?.message || 'Error'));
    } finally {
      setIsSavingWard(false);
    }
  }

  async function handleAddBed() {
    const trimmedNumber = newBedNumber.trim();
    if (!trimmedNumber) {
      alert('Please enter a bed number or identifier.');
      return;
    }

    setIsSavingBed(true);
    try {
      let targetWardId = newBedWardId || (wards.length > 0 ? wards[0].id : '');

      // If no wards exist yet, auto-create a default General Ward
      if (!targetWardId) {
        const defaultWard: Ward = {
          id: generateUUID(),
          name: 'General Ward',
          is_active: true,
          created_at: new Date().toISOString(),
        };
        const wardRes = await pushWardToSupabase(defaultWard);
        targetWardId = defaultWard.id;
        queryClient.setQueriesData<Ward[]>({ queryKey: queryKeys.wards.all }, (old) =>
          old ? [...old, defaultWard] : [defaultWard]
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.wards.all });
        setNewBedWardId(defaultWard.id);
      }

      const newBed: Bed = {
        id: generateUUID(),
        ward_id: targetWardId,
        bed_number: trimmedNumber,
        price_per_day: Number(newBedPrice) > 0 ? Number(newBedPrice) : 1200,
        is_occupied: false,
        created_at: new Date().toISOString(),
      };

      // Optimistic cache update so bed appears immediately in Bed Matrix
      queryClient.setQueriesData<Bed[]>({ queryKey: queryKeys.beds.all }, (old) =>
        old ? [...old, newBed] : [newBed]
      );

      const res = await pushBedToSupabase(newBed);
      if (!res.success) {
        alert('Warning: Bed could not be saved to Supabase: ' + (res.error?.message || 'Check database permissions'));
        return;
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
      setNewBedNumber('');
      setShowAddBedModal(false);
    } catch (err: any) {
      console.error('Error saving bed:', err);
      alert('Failed to save bed: ' + (err?.message || 'Unexpected error'));
    } finally {
      setIsSavingBed(false);
    }
  }

  async function handleUpdateBedPrice() {
    if (!editingBed) return;
    await pushBedToSupabase({ ...editingBed, price_per_day: editBedPrice });
    queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
    setEditingBed(null);
  }

  return (
    <>
      <PageHeader
        title="In-Patient (IP) Department"
        subtitle={`Bed occupancy, admissions, ${settings.ip_hours_per_day || 18}-hour daily billing timer & discharge`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Plus size={16} />}
              onClick={() => setShowAddBedModal(true)}
            >
              Add Bed
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => setShowAdmitModal(true)}>
              Admit Patient
            </Button>
          </div>
        }
      />

      <div className={dischargeTarget ? 'no-print' : ''}>
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5 sm:mb-6">
        {[
          { label: 'Total Hospital Beds', value: beds.length },
          { label: 'Occupied Beds', value: beds.filter((b) => b.is_occupied).length },
          { label: 'Available Free Beds', value: availableBeds.length },
          { label: 'Active IP Patients', value: admissions.filter((a) => a.status === 'admitted').length },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--bg-card)] rounded-[var(--r-tile)] p-3 sm:p-4 border border-[var(--line-soft)] flex flex-col justify-between min-h-[88px] sm:min-h-[100px] shadow-2xs">
            <p className="text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-strong)]">{s.value}</p>
            <p className="text-xs font-semibold text-[var(--text-muted)] mt-1 line-clamp-2 leading-snug">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-white rounded-[var(--r-pill)] p-1.5 w-full sm:w-fit shadow-[var(--shadow-float)] mb-5 sm:mb-6 border border-[var(--line-soft)] overflow-x-auto no-scrollbar snap-x">
        <button
          onClick={() => setActiveTab('admissions')}
          className={clsx(
            'px-3.5 sm:px-4 py-2 rounded-[var(--r-pill)] text-xs sm:text-sm font-semibold transition-all shrink-0 min-h-[40px] snap-start touch-manipulation cursor-pointer',
            activeTab === 'admissions' ? 'bg-[var(--green-900)] text-white shadow-xs' : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
          )}
        >
          Active Admissions & Daily Billing Timer
        </button>
        <button
          onClick={() => setActiveTab('beds')}
          className={clsx(
            'px-3.5 sm:px-4 py-2 rounded-[var(--r-pill)] text-xs sm:text-sm font-semibold transition-all shrink-0 min-h-[40px] snap-start touch-manipulation cursor-pointer',
            activeTab === 'beds' ? 'bg-[var(--green-900)] text-white shadow-xs' : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
          )}
        >
          Wards & Bed Occupancy Matrix
        </button>
      </div>

      {/* Tab 1: Admissions */}
      {activeTab === 'admissions' && (
        <Card>
          <CardHeader title="Current In-Patient Admissions" count={admissions.length} />

          {admissions.length === 0 ? (
            <EmptyState
              icon={<BedDouble size={28} />}
              title="No in-patients currently admitted"
              description="Admit a patient from reception or emergency to track bed occupancy and daily charges."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {admissions.map((adm) => {
                const pat = patients.find((p) => p.id === adm.patient_id);
                const doc = doctors.find((d) => d.id === adm.doctor_id);
                const bed = beds.find((b) => b.id === adm.bed_id);
                const ward = wards.find((w) => w.id === bed?.ward_id);
                const stay = calculateStay(adm.admitted_at);
                const bedCost = stay.billingDays * (bed?.price_per_day || 1200);
                const grandTotal = bedCost + (adm.total_pharmacy_charges || 0) + (adm.total_lab_charges || 0);

                return (
                  <div
                    key={adm.id}
                    className="bg-white rounded-[var(--r-tile)] p-4 border border-[var(--line-soft)] hover:border-[var(--green-600)]/50 hover:shadow-subtle transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-full bg-[var(--sage-100)] text-[var(--green-900)] font-bold flex flex-col items-center justify-center shrink-0 border border-[var(--green-300)] shadow-2xs">
                        <span className="text-xs font-bold leading-none">{bed?.bed_number || 'Bed'}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--text-strong)] leading-tight">{pat?.name}</span>
                          <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border text-[var(--text-strong)] font-bold">
                            UAID: {adm.uaid}
                          </span>
                          <StatusPill
                            variant={adm.status === 'admitted' ? 'info' : 'success'}
                            label={adm.status === 'admitted' ? 'Admitted' : 'Discharged'}
                          />
                        </div>

                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Ward: <strong>{ward?.name}</strong> · Doctor: <strong>{doc?.full_name}</strong> ({doc?.specialization})
                        </p>
                        <p className="text-xs text-[var(--text-muted)] italic mt-0.5">
                          Diagnosis: &quot;{adm.diagnosis}&quot;
                        </p>
                      </div>
                    </div>

                    {/* Timer & Billing Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t md:border-t-0 md:border-l pt-3 md:pt-0 md:pl-4 border-[var(--line-soft)] text-xs">
                      <div>
                        <p className="text-[var(--text-muted)] flex items-center gap-1">
                          <Clock size={13} className="text-[var(--green-700)] shrink-0" />
                          <span>Stay: <strong>{stay.totalHours} hrs</strong> ({stay.billingDays} day(s))</span>
                        </p>
                        <p className="text-[var(--text-muted)] mt-0.5">
                          Bed: ₹{bedCost} · Rx: ₹{adm.total_pharmacy_charges || 0} · Total: <strong className="text-[var(--green-700)]">₹{grandTotal}</strong>
                        </p>
                      </div>

                      {adm.status === 'admitted' && (
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                          {/* Write IP Daily Prescription (Section 3.7) */}
                          <Link
                            href={`/doctor/prescribe?patientId=${pat?.id}&name=${encodeURIComponent(pat?.name || '')}&uhid=${pat?.uhid}&age=${pat?.age}&doctorId=${doc?.id}&uaid=${adm.uaid}&day=${stay.billingDays}`}
                            className="w-full sm:w-auto"
                          >
                            <Button size="sm" variant="secondary" icon={<FileText size={13} />} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]">
                              Rx Day {stay.billingDays}
                            </Button>
                          </Link>

                          {/* Discharge & Final Bill */}
                          <Button size="sm" variant="danger" onClick={() => setDischargeTarget(adm)} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]">
                            Discharge
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Tab 2: Bed Matrix */}
      {activeTab === 'beds' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">Hospital Wards & Bed Status</h3>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setShowAddWardModal(true)}>
              Add Ward
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {wards.map((ward) => {
              const wardBeds = beds.filter((b) => b.ward_id === ward.id);
              return (
                <Card key={ward.id}>
                  <CardHeader title={ward.name} count={wardBeds.length} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {wardBeds.map((b) => (
                      <div
                        key={b.id}
                        className={clsx(
                          'p-3 rounded-[var(--r-tile)] border text-center transition-all relative group',
                          b.is_occupied
                            ? 'bg-red-50/60 border-red-200'
                            : 'bg-green-50/60 border-green-200'
                        )}
                      >
                        <p className="text-xs font-semibold text-[var(--text-strong)]">{b.bed_number}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">₹{b.price_per_day}/day</p>
                        <span
                          className={clsx(
                            'inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1.5',
                            b.is_occupied ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'
                          )}
                        >
                          {b.is_occupied ? 'Occupied' : 'Free Bed'}
                        </span>

                        {/* Edit Bed Price Action */}
                        <button
                          onClick={() => {
                            setEditingBed(b);
                            setEditBedPrice(b.price_per_day);
                          }}
                          className="text-[10px] text-[var(--green-700)] underline mt-1 block w-full hover:font-bold"
                        >
                          Edit Rate
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* Discharge & Final Itemized Bill Modal (PRD v1.1 Section 3.7) */}
      {dischargeTarget && (() => {
        const pat = patients.find((p) => p.id === dischargeTarget.patient_id);
        const doc = doctors.find((d) => d.id === dischargeTarget.doctor_id);
        const bed = beds.find((b) => b.id === dischargeTarget.bed_id);
        const ward = wards.find((w) => w.id === bed?.ward_id);
        const stay = calculateStay(dischargeTarget.admitted_at);
        const bedCharges = stay.billingDays * (bed?.price_per_day || 1200);
        const rxCharges = dischargeTarget.total_pharmacy_charges || 0;
        const labCharges = dischargeTarget.total_lab_charges || 0;
        const grandTotal = bedCharges + rxCharges + labCharges;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-xl shadow-[var(--shadow-float)] border border-[var(--line-soft)] max-h-[90vh] overflow-y-auto paper-a4">
              <div className="flex justify-between items-center pb-3 border-b border-[var(--line-soft)] mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-strong)]">Discharge & Final Hospital Bill</h3>
                  <p className="text-xs text-[var(--text-muted)]">Stops the daily timer and produces itemized settlement</p>
                </div>
                <button onClick={() => setDischargeTarget(null)} className="text-[var(--text-muted)] hover:text-[var(--text-strong)] cursor-pointer no-print">
                  <X size={20} />
                </button>
              </div>

              {/* Printable Invoice Header */}
              <div className="bg-[var(--bg-tile)] p-4 rounded-[var(--r-tile)] border border-[var(--line-soft)] mb-4 text-xs space-y-2">
                <div className="flex justify-between border-b pb-2">
                  <div>
                    <span className="font-bold text-sm text-[var(--text-strong)]">{settings.hospital_name || 'RADHA KRISHNA HOSPITAL'}</span>
                    <p className="text-[10px] text-[var(--text-muted)]">{settings.address || 'Ward No. 10, NR Extension, Chintamani'}</p>
                    {settings.phone && <p className="text-[10px] text-[var(--text-muted)]">Ph: {settings.phone}</p>}
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[var(--green-700)]">UAID: {dischargeTarget.uaid}</span>
                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5">Discharge Summary & Tax Bill</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[var(--text-muted)]">Patient: </span>
                    <strong className="text-[var(--text-strong)]">{pat?.name}</strong> ({pat?.uhid})
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Consultant: </span>
                    <strong>{doc?.full_name}</strong>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Ward / Bed: </span>
                    <strong>{ward?.name} · {bed?.bed_number}</strong>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Billing Day Length: </span>
                    <strong>{settings.ip_hours_per_day || 18} Hours/Day</strong>
                  </div>
                </div>
              </div>

              {/* Itemized Charges */}
              <div className="border border-[var(--line-soft)] rounded-[var(--r-tile)] overflow-hidden mb-4 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[var(--bg-tile)] border-b border-[var(--line-soft)] text-[var(--text-muted)]">
                    <tr>
                      <th className="p-2.5">Billing Component</th>
                      <th className="p-2.5 text-center">Metric</th>
                      <th className="p-2.5 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line-soft)]">
                    <tr>
                      <td className="p-2.5 font-medium">Room / Bed Occupancy Charges</td>
                      <td className="p-2.5 text-center">{stay.billingDays} day(s) ({stay.totalHours} hrs)</td>
                      <td className="p-2.5 text-right font-semibold">₹{bedCharges.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">In-Patient Pharmacy & Medications</td>
                      <td className="p-2.5 text-center">Dispensed Items</td>
                      <td className="p-2.5 text-right font-semibold">₹{rxCharges.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Diagnostics & Clinical Lab Tests</td>
                      <td className="p-2.5 text-center">Investigations</td>
                      <td className="p-2.5 text-right font-semibold">₹{labCharges.toFixed(2)}</td>
                    </tr>
                    <tr className="bg-[var(--sage-100)] font-bold text-sm text-[var(--green-900)]">
                      <td className="p-3" colSpan={2}>Grand Total Settlement</td>
                      <td className="p-3 text-right">₹{grandTotal.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signature block */}
              <div className="my-5 pt-3 border-t border-[var(--line-soft)] flex justify-between items-end text-xs text-[var(--text-muted)]">
                <div>
                  <p className="italic">Thank you for choosing {settings.hospital_name || 'Radha Krishna Hospital'}.</p>
                  <p className="text-[10px]">Wish you a speedy and complete recovery.</p>
                </div>
                <div className="text-right">
                  <div className="h-7 border-b border-gray-400 w-36 ml-auto mb-1"></div>
                  <p className="font-semibold text-[var(--text-strong)] text-[11px]">Authorized Billing Signatory</p>
                </div>
              </div>

              <div className="flex gap-2 no-print">
                <Button
                  variant="secondary"
                  icon={<Printer size={15} />}
                  onClick={() => window.print()}
                  className="flex-1"
                  title="Print Bill on A4/A5 or any printer"
                >
                  Print Bill
                </Button>
                <Button
                  variant="danger"
                  onClick={handleConfirmDischarge}
                  className="flex-1"
                >
                  Confirm Discharge & Free Bed
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Admit Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-lg shadow-[var(--shadow-float)]">
            <h3 className="text-lg font-semibold text-[var(--text-strong)] mb-4">Admit In-Patient (IP)</h3>

            <form onSubmit={handleAdmit} className="flex flex-col gap-3.5 text-xs">
              <div className="relative" ref={patientDropdownRef}>
                <label className="text-[var(--text-muted)] block mb-1">Select Patient *</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setShowPatientDropdown(true);
                      const match = patients.find(
                        (p) =>
                          p.name.toLowerCase() === e.target.value.trim().toLowerCase() ||
                          p.uhid.toLowerCase() === e.target.value.trim().toLowerCase()
                      );
                      if (match) {
                        setAdmitPatientId(match.id);
                      }
                    }}
                    onFocus={() => setShowPatientDropdown(true)}
                    placeholder="Type patient name, UHID, or phone to search..."
                    className="h-10 w-full rounded-[var(--r-control)] border px-3 pr-9 text-xs bg-white text-[var(--text-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--green-700)] shadow-2xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPatientDropdown((prev) => !prev)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-tile)] rounded transition-colors cursor-pointer"
                    title="Select patient from list"
                    tabIndex={-1}
                  >
                    <ChevronDown
                      size={15}
                      className={clsx('transition-transform duration-200 text-[var(--green-800)]', showPatientDropdown && 'rotate-180')}
                    />
                  </button>
                </div>

                {/* Dropdown Options */}
                {showPatientDropdown && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-[var(--r-card)] border border-[var(--line-soft)] shadow-[var(--shadow-float)] py-1 divide-y divide-[var(--line-soft)]/50">
                    {filteredAdmissionPatients.length === 0 ? (
                      <div className="p-3 text-center text-xs text-[var(--text-muted)]">
                        No patients found matching &quot;{patientSearch}&quot;
                      </div>
                    ) : (
                      filteredAdmissionPatients.map((p) => {
                        const isSelected = p.id === admitPatientId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setAdmitPatientId(p.id);
                              setPatientSearch(`${p.name} (${p.uhid} · ${p.age}y · ${p.phone})`);
                              setShowPatientDropdown(false);
                            }}
                            className={clsx(
                              'w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer',
                              isSelected ? 'bg-[var(--sage-100)] text-[var(--green-900)] font-semibold' : 'hover:bg-[var(--bg-tile)] text-[var(--text-strong)]'
                            )}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-sm leading-tight text-[var(--text-strong)]">{p.name}</p>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                UHID: <span className="font-mono font-semibold">{p.uhid}</span> · {p.age}y · {p.phone}
                              </p>
                            </div>
                            {isSelected && <Check size={14} className="text-[var(--green-700)] shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Select Available Bed *</label>
                {availableBeds.length === 0 ? (
                  <p className="text-xs text-[var(--danger)]">All hospital beds are currently occupied.</p>
                ) : (
                  <select
                    value={admitBedId}
                    onChange={(e) => setAdmitBedId(e.target.value)}
                    className="h-10 w-full rounded-[var(--r-control)] border px-3 text-xs bg-white"
                    required
                  >
                    <option value="">Choose Bed...</option>
                    {availableBeds.map((b) => {
                      const ward = wards.find((w) => w.id === b.ward_id);
                      return (
                        <option key={b.id} value={b.id}>
                          {b.bed_number} ({ward?.name}) - ₹{b.price_per_day}/day
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Attending Doctor *</label>
                <select
                  value={admitDoctorId}
                  onChange={(e) => setAdmitDoctorId(e.target.value)}
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-xs bg-white"
                  required
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Admission Diagnosis / Medical Reason</label>
                <input
                  type="text"
                  value={admitDiagnosis}
                  onChange={(e) => setAdmitDiagnosis(e.target.value)}
                  placeholder="e.g. Acute severe bronchitis / Post-op observation"
                  className="h-10 w-full rounded-[var(--r-control)] border px-3 text-xs"
                />
              </div>

              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasBP}
                    onChange={(e) => setHasBP(e.target.checked)}
                    className="accent-[var(--green-900)] h-4 w-4"
                  />
                  <span>BP Flag</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasSugar}
                    onChange={(e) => setHasSugar(e.target.checked)}
                    className="accent-[var(--green-900)] h-4 w-4"
                  />
                  <span>Sugar Flag</span>
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button type="submit" className="flex-1" disabled={availableBeds.length === 0 || isAdmitting}>
                  {isAdmitting ? 'Admitting...' : 'Confirm Admission & Start Timer'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowAdmitModal(false)} disabled={isAdmitting} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Ward Modal */}
      {showAddWardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-sm shadow-[var(--shadow-float)]">
            <h3 className="text-base font-semibold text-[var(--text-strong)] mb-3">Add Hospital Ward</h3>
            <input
              type="text"
              value={newWardName}
              onChange={(e) => setNewWardName(e.target.value)}
              placeholder="e.g. Pediatric ICU / Surgical Post-Op"
              className="h-10 w-full rounded-[var(--r-control)] border px-3 text-xs mb-4"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddWard} disabled={isSavingWard} className="flex-1">
                {isSavingWard ? 'Creating...' : 'Create Ward'}
              </Button>
              <Button variant="secondary" onClick={() => setShowAddWardModal(false)} disabled={isSavingWard} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Bed Modal */}
      {showAddBedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-sm shadow-[var(--shadow-float)]">
            <h3 className="text-base font-semibold text-[var(--text-strong)] mb-3">Add Hospital Bed</h3>
            <div className="space-y-3 mb-4 text-xs">
              <div>
                <label className="text-[var(--text-muted)] block mb-1">Ward *</label>
                {wards.length === 0 ? (
                  <div className="bg-[var(--bg-tile)] p-2 rounded-[var(--r-control)] border border-[var(--line-soft)] text-xs text-[var(--text-muted)] leading-relaxed">
                    No wards registered yet. A default &quot;General Ward&quot; will be created automatically.
                  </div>
                ) : (
                  <select
                    value={newBedWardId || (wards[0]?.id || '')}
                    onChange={(e) => setNewBedWardId(e.target.value)}
                    className="h-9 w-full rounded-[var(--r-control)] border px-2.5 text-xs bg-white"
                  >
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-[var(--text-muted)] block mb-1">Bed Number / Name *</label>
                <input
                  type="text"
                  value={newBedNumber}
                  onChange={(e) => setNewBedNumber(e.target.value)}
                  placeholder="e.g. Bed 105 / Deluxe Suite 3"
                  className="h-9 w-full rounded-[var(--r-control)] border px-2.5 text-xs"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[var(--text-muted)] block mb-1">Price per Day (₹)</label>
                <input
                  type="number"
                  min={100}
                  step={50}
                  value={newBedPrice}
                  onChange={(e) => setNewBedPrice(Number(e.target.value) || 0)}
                  className="h-9 w-full rounded-[var(--r-control)] border px-2.5 text-xs font-bold"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddBed} disabled={isSavingBed} className="flex-1">
                {isSavingBed ? 'Saving Bed...' : 'Save Bed'}
              </Button>
              <Button variant="secondary" onClick={() => setShowAddBedModal(false)} disabled={isSavingBed} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Bed Rate Modal */}
      {editingBed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--r-card)] p-6 w-full max-w-sm shadow-[var(--shadow-float)]">
            <h3 className="text-base font-semibold text-[var(--text-strong)] mb-1">Update Bed Rate</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {editingBed.bed_number} · Rate change applies to future days only
            </p>
            <input
              type="number"
              min={100}
              step={50}
              value={editBedPrice}
              onChange={(e) => setEditBedPrice(Number(e.target.value) || 0)}
              className="h-10 w-full rounded-[var(--r-control)] border px-3 text-xs font-bold mb-4"
            />
            <div className="flex gap-2">
              <Button onClick={handleUpdateBedPrice} className="flex-1">Save Rate</Button>
              <Button variant="secondary" onClick={() => setEditingBed(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
