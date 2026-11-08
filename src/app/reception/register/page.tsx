'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, MessageSquare, Plus, Search, UserCheck, AlertCircle, Printer } from 'lucide-react';
import Link from 'next/link';
import { Card, Button, Input, Select, Checkbox, Textarea, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useDoctors, usePatients, useHospitalSettings } from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { pushPatientToSupabase, pushVisitToSupabase } from '@/lib/supabase/sync';
import { registerPatientAndVisitAtomic } from '@/lib/api/mutations';
import { isValidIndianPhone, cleanIndianPhone } from '@/lib/utils/validation';
import { recordAuditLog } from '@/lib/audit/logger';
import type { Patient, Visit } from '@/lib/types/database';

const BLOOD_GROUPS = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
];

interface FormState {
  name: string;
  age: string;
  phone: string;
  uhidLookup: string;
  bloodGroup: string;
  hasBP: boolean;
  hasSugar: boolean;
  hasOther: boolean;
  otherCondition: string;
  doctorId: string;
}

export default function RegisterPatientPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: doctors = [] } = useDoctors();
  const { data: patients = [] } = usePatients();
  const { data: settings = { hospital_name: 'RADHAKRISHNA HOSPITAL' } as any } = useHospitalSettings();

  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: `${d.full_name} (${d.specialization || 'Consultant'}) - ${d.consultation_room || 'OPD'}`,
  }));

  const [form, setForm] = useState<FormState>({
    name: '',
    age: '',
    phone: '',
    uhidLookup: '',
    bloodGroup: '',
    hasBP: false,
    hasSugar: false,
    hasOther: false,
    otherCondition: '',
    doctorId: doctors[0]?.id || '',
  });

  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdResult, setCreatedResult] = useState<{ patient: Patient; visit: Visit } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-search existing patient when typing phone (10 digits) or UHID
  useEffect(() => {
    const cleanedPhone = cleanIndianPhone(form.phone);
    const cleanedUhid = form.uhidLookup.trim().toUpperCase();

    let found: Patient | undefined;
    if (cleanedPhone.length === 10) {
      found = patients.find((p) => cleanIndianPhone(p.phone) === cleanedPhone);
    }
    if (!found && cleanedUhid.length >= 3) {
      found = patients.find((p) => p.uhid.toUpperCase() === cleanedUhid);
    }

    if (found) {
      setMatchedPatient(found);
      setForm((prev) => ({
        ...prev,
        name: found!.name,
        age: String(found!.age),
        phone: found!.phone,
        bloodGroup: found!.blood_group || '',
        hasBP: found!.has_bp,
        hasSugar: found!.has_sugar,
        hasOther: Boolean(found!.other_conditions),
        otherCondition: found!.other_conditions || '',
      }));
    } else {
      setMatchedPatient(null);
    }
  }, [form.phone, form.uhidLookup, patients]);

  // Auto-select first available doctor when doctors list loads from Supabase
  useEffect(() => {
    if (!form.doctorId && doctors.length > 0) {
      setForm((f) => ({ ...f, doctorId: doctors[0].id }));
    }
  }, [doctors, form.doctorId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Patient name is required.';
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) < 0 || Number(form.age) > 120) {
      errs.age = 'Enter a valid age (0-120).';
    }
    const cleanedPhone = cleanIndianPhone(form.phone);
    if (!cleanedPhone) {
      errs.phone = '10-digit Indian mobile number is required.';
    } else if (!isValidIndianPhone(cleanedPhone)) {
      errs.phone = 'Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).';
    }
    if (!form.doctorId) {
      errs.doctorId = 'Please select a consultant doctor.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || !validate()) return;
    setIsSubmitting(true);

    try {
      const cleanedPhone = cleanIndianPhone(form.phone);
      // 1. Attempt atomic DB registration with advisory locking & sequences (Phase 2)
      const res = await registerPatientAndVisitAtomic({
        name: form.name.trim(),
        age: Number(form.age),
        phone: cleanedPhone,
        doctorId: form.doctorId,
        bloodGroup: form.bloodGroup || undefined,
        hasBP: form.hasBP,
        hasSugar: form.hasSugar,
        otherConditions: form.hasOther ? form.otherCondition.trim() : undefined,
        uhid: form.uhidLookup.trim() || undefined,
      });

      // Record audit log for patient registration & OPD token creation
      recordAuditLog({
        action: 'PATIENT_REGISTERED',
        entity_type: 'patient',
        entity_id: res.patient.id,
        user_name: 'Reception Desk',
        user_role: 'receptionist',
        details: `Registered OPD patient ${form.name.trim()} (UHID: ${res.patient.uhid}, Token #${res.visit.token_number})`,
        new_data: {
          uhid: res.patient.uhid,
          name: form.name.trim(),
          phone: cleanedPhone,
          age: Number(form.age),
          token: res.visit.token_number,
        },
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });

      setCreatedResult(res);
    } catch (err: any) {
      console.error('Registration failed:', err?.message || err);
      alert('Patient registration failed: ' + (err?.message || 'Server error. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const assignedDoctor = doctors.find((d) => d.id === (createdResult?.visit.doctor_id || form.doctorId));

  // ────────────────────────────────────────────────────────────────────────────
  // POST-REGISTRATION DISPLAY (PRD v1.1 Rule: No token slip printed at reception)
  // Shows large token number on screen for verbal communication + WhatsApp option
  // ────────────────────────────────────────────────────────────────────────────
  if (createdResult) {
    const doctorName = assignedDoctor?.full_name || 'Consultant Doctor';
    const room = assignedDoctor?.consultation_room || 'OPD Consultation Room';
    const tokenDisplay = String(createdResult.visit.token_number).padStart(2, '0');

    // WhatsApp message URL
    const waText = encodeURIComponent(
      `Namaste ${createdResult.patient.name}, your OPD token at ${settings.hospital_name} is #${tokenDisplay}.\n` +
      `Doctor: ${doctorName}\n` +
      `Room / Cabin: ${room}\n` +
      `Visit ID: ${createdResult.visit.visit_number} · UHID: ${createdResult.patient.uhid}\n` +
      `Please be seated in the waiting lobby. Thank you.`
    );
    const waUrl = `https://wa.me/91${createdResult.patient.phone}?text=${waText}`;

    return (
      <div className="py-6 max-w-xl mx-auto">
        <div className="no-print">
          <PageHeader title="Patient Registered & Token Issued" subtitle="Token issued successfully and assigned to live OPD queue" />

          <Card className="text-center shadow-[var(--shadow-card)] border border-[var(--line-soft)]">
            <div className="flex flex-col items-center gap-4 py-4 sm:py-6">
              <div className="h-14 w-14 rounded-full bg-[var(--success-bg)] border border-[var(--success-border)] flex items-center justify-center shadow-xs">
                <CheckCircle size={32} className="text-[var(--success)]" />
              </div>

              {/* Hero Token Display on Screen */}
              <div className="w-full flex flex-col items-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--bg-tile)] border border-[var(--line-soft)] text-[var(--text-muted)]">
                  Daily Token Number
                </span>
                <div className="my-3 py-5 px-8 sm:px-12 bg-gradient-to-b from-[var(--sage-100)] to-white border-2 border-[var(--green-600)] rounded-3xl shadow-sm inline-flex flex-col items-center justify-center ring-4 ring-[var(--sage-200)]/60">
                  <span className="text-6xl sm:text-8xl leading-none font-black tabular-nums text-[var(--green-900)] tracking-tight">
                    {tokenDisplay}
                  </span>
                </div>
                <p className="text-base sm:text-lg font-bold text-[var(--text-strong)] mt-1">
                  Announce / Tell Patient: <span className="text-[var(--green-700)] underline decoration-2 underline-offset-4 font-extrabold">Token #{tokenDisplay}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Assigned to <strong className="text-[var(--text-strong)] font-semibold">{doctorName}</strong> · Room: <strong className="text-[var(--text-strong)] font-semibold">{room}</strong>
                </p>
              </div>

              {/* Patient & Visit Details Tile */}
              <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 sm:p-5 w-full text-left space-y-2.5 border border-[var(--line-soft)] text-xs shadow-2xs">
                <div className="flex justify-between items-center border-b border-[var(--line-soft)] pb-2.5">
                  <span className="font-bold text-sm text-[var(--text-strong)]">{createdResult.patient.name}</span>
                  <span className="text-[11px] font-mono font-bold text-[var(--green-700)] bg-white px-2.5 py-0.5 rounded-full border border-[var(--line-soft)] shadow-2xs">
                    UHID: {createdResult.patient.uhid}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[var(--text-body)]">
                  <div>
                    <span className="text-[var(--text-muted)] font-medium">Age / Phone: </span>
                    <span className="font-semibold text-[var(--text-strong)]">{createdResult.patient.age}y · {createdResult.patient.phone}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] font-medium">Blood Group: </span>
                    <span className="font-semibold text-[var(--text-strong)]">{createdResult.patient.blood_group || 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] font-medium">Visit Number: </span>
                    <span className="font-semibold font-mono text-[var(--text-strong)]">{createdResult.visit.visit_number}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] font-medium">Queue Status: </span>
                    <span className="font-bold text-[var(--green-700)]">Waiting in OPD (# {tokenDisplay})</span>
                  </div>
                </div>
              </div>

              {/* Physical Token Slip & WhatsApp Actions */}
              <div className="flex flex-col sm:flex-row gap-2.5 w-full">
                <Button
                  variant="secondary"
                  icon={<Printer size={16} />}
                  className="flex-1 justify-center min-h-[46px] border border-[var(--line-soft)]"
                  onClick={() => window.print()}
                  title="Print OPD Token Slip on 80mm/58mm Thermal POS or A4/A5 printer"
                >
                  Print Token Slip
                </Button>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-[var(--r-control)] bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-semibold shadow-xs hover:shadow-md transition-all cursor-pointer"
                >
                  <MessageSquare size={16} />
                  Send WhatsApp Token
                </a>
              </div>

              {/* Secondary Actions */}
              <div className="flex flex-col sm:flex-row gap-3 w-full pt-1">
                <Button
                  variant="secondary"
                  icon={<Plus size={16} />}
                  className="flex-1 w-full justify-center min-h-[44px]"
                  onClick={() => {
                    setCreatedResult(null);
                    setMatchedPatient(null);
                    setForm({
                      name: '',
                      age: '',
                      phone: '',
                      uhidLookup: '',
                      bloodGroup: '',
                      hasBP: false,
                      hasSugar: false,
                      hasOther: false,
                      otherCondition: '',
                      doctorId: doctors[0]?.id || '',
                    });
                  }}
                >
                  Register Next Patient
                </Button>
                <Link
                  href="/reception"
                  className="flex-1 w-full min-h-[44px] px-4 text-xs font-semibold rounded-[var(--r-control)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-all flex items-center justify-center text-center cursor-pointer"
                >
                  Return to Reception Desk
                </Link>
              </div>
            </div>
          </Card>
        </div>

        {/* ── DEDICATED PRINTABLE TOKEN SLIP (Auto-formats for 80mm/58mm POS Thermal or A4/A5 desktop printers) ── */}
        <div className="print-only printable-token-slip paper-thermal max-w-[76mm] mx-auto p-4 text-black font-mono text-center text-xs leading-normal bg-white">
          <div className="border-b border-dashed border-black pb-2 mb-2">
            <h2 className="font-bold text-sm uppercase">{settings.hospital_name || 'RADHA KRISHNA HOSPITAL'}</h2>
            <p className="text-[9px] text-gray-700">{settings.address || 'Ward No. 10, NR Extension, Chintamani'}</p>
            {settings.phone && <p className="text-[9px] text-gray-700">Ph: {settings.phone}</p>}
            <p className="text-[10px] font-bold uppercase mt-1 tracking-wider border-t border-dotted border-gray-400 pt-1">
              OPD APPOINTMENT TOKEN
            </p>
          </div>

          <div className="my-2 py-2 border-y-2 border-black">
            <p className="text-[9px] uppercase font-bold text-gray-700 tracking-wider">TOKEN NUMBER</p>
            <p className="text-4xl font-black tracking-tight">{tokenDisplay}</p>
          </div>

          <div className="text-left text-[10px] space-y-1 border-b border-dashed border-black pb-2 mb-2">
            <div><strong>Patient:</strong> {createdResult.patient.name}</div>
            <div><strong>Age / Blood:</strong> {createdResult.patient.age}Y · {createdResult.patient.blood_group || '—'}</div>
            <div><strong>UHID:</strong> <span className="font-mono">{createdResult.patient.uhid}</span></div>
            <div><strong>Phone:</strong> {createdResult.patient.phone}</div>
            <div><strong>Consultant:</strong> {doctorName}</div>
            <div><strong>Room:</strong> {room}</div>
            <div><strong>Date/Time:</strong> {new Date().toLocaleDateString('en-IN')} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>

          <div className="text-[9px] text-gray-700">
            <p>Please wait for your token to be called.</p>
            <p className="mt-1 font-bold">*** Thank You ***</p>
            <p className="text-[7.5px] text-gray-500 font-sans mt-1">Radha Krishna HMS · opti-x.in</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/reception"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = '/reception';
          }}
          className="h-10 w-10 flex items-center justify-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] hover:border-[var(--green-600)] transition-all cursor-pointer shadow-xs shrink-0"
          title="Back to Reception Desk"
          aria-label="Back to Reception Desk"
        >
          <ArrowLeft size={18} />
        </a>
        <PageHeader title="New OPD Registration" subtitle="Register patient, issue daily token & assign doctor queue" />
      </div>

      {/* Returning Patient Banner */}
      {matchedPatient && (
        <div className="flex items-center gap-3 bg-[var(--success-bg)] border border-[var(--success)] rounded-[var(--r-tile)] p-4 mb-5 text-xs text-[#2A6E24]">
          <UserCheck size={20} className="shrink-0" />
          <div className="flex-1">
            <strong>Returning Patient Recognized:</strong> {matchedPatient.name} (UHID: {matchedPatient.uhid}).
            Demographics and medical flags have been pre-filled. A new visit and token will be generated.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Patient Details */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <Card>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--line-soft)]">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-[var(--text-strong)] font-[family-name:var(--font-heading)]">
                    1. Patient Identification & Demographics
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Enter phone or UHID to auto-lookup returning patients.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5">
                <div className="sm:col-span-2">
                  <Input
                    label="Mobile Phone Number *"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="10-digit mobile number (e.g. 9876543210)"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    error={errors.phone}
                    maxLength={10}
                    hint="Lookup runs automatically as you enter 10 digits"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="Full Name *"
                    placeholder="Enter patient's full name"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    error={errors.name}
                    autoComplete="name"
                  />
                </div>

                <Input
                  label="Age (Years) *"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 35"
                  min={0}
                  max={120}
                  value={form.age}
                  onChange={(e) => update('age', e.target.value)}
                  error={errors.age}
                />

                <Select
                  label="Blood Group (Optional)"
                  placeholder="Select blood group"
                  options={BLOOD_GROUPS}
                  value={form.bloodGroup}
                  onChange={(e) => update('bloodGroup', (e.target as HTMLSelectElement).value)}
                />
              </div>
            </Card>

            <Card>
              <div className="mb-4 pb-3 border-b border-[var(--line-soft)]">
                <h3 className="text-base sm:text-lg font-semibold text-[var(--text-strong)] font-[family-name:var(--font-heading)]">
                  2. Medical Flags & Comorbidities
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Flags will be displayed prominently on the doctor&apos;s consultation queue.
                </p>
              </div>

              <div className="flex flex-col gap-3.5">
                <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] hover:border-[var(--green-600)]/40 transition-colors">
                  <Checkbox
                    label="Blood Pressure (Hypertension)"
                    checked={form.hasBP}
                    onChange={(e) => update('hasBP', e.target.checked)}
                  />
                </div>
                <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] hover:border-[var(--green-600)]/40 transition-colors">
                  <Checkbox
                    label="Diabetes / Blood Sugar"
                    checked={form.hasSugar}
                    onChange={(e) => update('hasSugar', e.target.checked)}
                  />
                </div>
                <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] hover:border-[var(--green-600)]/40 transition-colors">
                  <Checkbox
                    label="Other existing medical conditions or allergies"
                    checked={form.hasOther}
                    onChange={(e) => update('hasOther', e.target.checked)}
                  />
                </div>
                {form.hasOther && (
                  <div className="ml-2 sm:ml-4 pl-3 border-l-2 border-[var(--green-600)]">
                    <Textarea
                      placeholder="Specify conditions, known drug allergies or medical notes..."
                      value={form.otherCondition}
                      onChange={(e) => update('otherCondition', e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column: Doctor Assignment & Token Generation */}
          <div className="flex flex-col gap-5">
            <Card>
              <div className="mb-4 pb-3 border-b border-[var(--line-soft)]">
                <h3 className="text-base sm:text-lg font-semibold text-[var(--text-strong)] font-[family-name:var(--font-heading)]">
                  3. Consultant Doctor
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Assign doctor to immediately queue this patient.
                </p>
              </div>

              <div className="flex flex-col gap-3.5">
                {doctorOptions.length === 0 ? (
                  <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] p-3.5 rounded-[var(--r-control)] text-xs space-y-2">
                    <p className="font-semibold flex items-center gap-1.5 text-[var(--warning-text)]">
                      <AlertCircle size={14} className="text-[var(--warning)] shrink-0" />
                      No Doctors Registered Yet
                    </p>
                    <p className="text-[var(--text-muted)]">
                      There are no registered consultant doctors in the system. Please register a doctor account first to assign patient OPD queues.
                    </p>
                    <Link href="/register" className="block pt-1">
                      <Button size="sm" variant="secondary" className="w-full">
                        + Register Doctor Account
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Select
                    label="Select Consultant *"
                    options={doctorOptions}
                    value={form.doctorId}
                    onChange={(e) => update('doctorId', (e.target as HTMLSelectElement).value)}
                    error={errors.doctorId}
                  />
                )}

                {assignedDoctor && (
                  <div className="bg-[var(--sage-100)] rounded-[var(--r-tile)] p-3.5 text-xs space-y-1.5 border border-[var(--sage-200)] shadow-2xs">
                    <p className="font-bold text-sm text-[var(--green-900)]">{assignedDoctor.full_name}</p>
                    <p className="text-[var(--text-muted)]">
                      Specialization: <strong className="text-[var(--text-strong)]">{assignedDoctor.specialization || 'Consultant'}</strong>
                    </p>
                    <p className="text-[var(--text-muted)]">
                      Room / Cabin: <strong className="text-[var(--text-strong)]">{assignedDoctor.consultation_room || 'OPD Room'}</strong>
                    </p>
                    <p className="text-[var(--green-700)] font-semibold pt-0.5">
                      Timings: {assignedDoctor.opd_timings || '09:00 AM - 01:00 PM'}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--line-soft)] flex flex-col gap-2.5">
                <Button type="submit" size="lg" className="w-full min-h-[46px] shadow-sm font-semibold" loading={isSubmitting} disabled={isSubmitting}>
                  {isSubmitting ? 'Registering...' : 'Save & Generate Token'}
                </Button>
                <a
                  href="/reception"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = '/reception';
                  }}
                  className="w-full min-h-[42px] px-4 text-xs font-semibold rounded-[var(--r-control)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-all flex items-center justify-center text-center cursor-pointer"
                >
                  Cancel & Return to Reception
                </a>
                <p className="text-[11px] text-[var(--text-muted)] text-center mt-0.5">
                  Token displays immediately on screen (paperless flow).
                </p>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </>
  );
}
